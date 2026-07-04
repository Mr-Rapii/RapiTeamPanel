import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, query, where, getDocs, doc, updateDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB674t6fiJ8HT9ENfeS3Vzv-BSGQTQ-3BI",
  authDomain: "rapi-dev-43ddf.firebaseapp.com",
  projectId: "rapi-dev-43ddf",
  storageBucket: "rapi-dev-43ddf.firebasestorage.app",
  messagingSenderId: "392684134756",
  appId: "1:392684134756:web:6ef9ed85f4fb29db29da71"
};

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const ADMIN_WA = process.env.ADMIN_WA; // nomor Owner/Admin buat eskalasi, format 62xxxxxxxxxx

async function sendWa(target, message) {
  const form = new URLSearchParams();
  form.append("target", target);
  form.append("message", message);

  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: FONNTE_TOKEN },
    body: form
  });
  return res.json();
}

export default async function handler(req, res) {
  if (!FONNTE_TOKEN) {
    return res.status(500).json({ ok: false, error: "FONNTE_TOKEN belum diset di Environment Variables" });
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const membersCol = collection(db, "rapiTeamMembers");

  const snap = await getDocs(query(membersCol, where("status_intro", "==", "belum")));

  const now = Date.now();
  const results = { reminded: [], escalated: [], skipped: 0 };

  for (const d of snap.docs) {
    const data = d.data();
    if (!data.join_at) { results.skipped++; continue; }

    const joinMs = data.join_at.toDate ? data.join_at.toDate().getTime() : new Date(data.join_at).getTime();
    const hoursSince = (now - joinMs) / 3600000;
    const reminderCount = data.reminder_terkirim || 0;

    try {
      // Tahap 1: sudah 24 jam, belum pernah diingatkan -> WA ke member
      if (hoursSince >= 24 && reminderCount === 0) {
        await sendWa(
          data.nomor_wa,
          `Hai! Sudah 24 jam kamu join Rapi Team tapi belum isi form Intro.\n\nYuk isi sekarang biar resmi jadi bagian dari grup:\nhttps://rapi-team-panel.vercel.app/intro-form.html\n\nKalau ada kendala, hubungi Admin ya 🙏`
        );
        await updateDoc(doc(membersCol, d.id), { reminder_terkirim: 1 });
        results.reminded.push(data.nomor_wa);
      }
      // Tahap 2: sudah 48 jam, sudah diingatkan sekali, masih diam -> eskalasi ke Admin
      else if (hoursSince >= 48 && reminderCount === 1 && ADMIN_WA) {
        await sendWa(
          ADMIN_WA,
          `⚠️ Member dengan nomor ${data.nomor_wa} sudah 48 jam join tapi belum isi Intro, sudah diingatkan 1x. Mohon ditindaklanjuti (perpanjang waktu / keluarkan sesuai SOP).`
        );
        await updateDoc(doc(membersCol, d.id), { reminder_terkirim: 2 });
        results.escalated.push(data.nomor_wa);
      } else {
        results.skipped++;
      }
    } catch (e) {
      results.skipped++;
    }
  }

  res.status(200).json({ ok: true, ...results });
      }
