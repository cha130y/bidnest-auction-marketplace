export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ_KNOWLEDGE_BASE: FaqEntry[] = [
  {
    question: 'สมัครสมาชิกยังไง',
    answer:
      'กดปุ่ม "สมัครสมาชิก" มุมขวาบน กรอกอีเมลและรหัสผ่าน แล้วยืนยัน OTP ที่ส่งไปทางอีเมล'
  },
  {
    question: 'วิธีเข้าร่วมประมูล',
    answer:
      'เปิดหน้ารายละเอียดสินค้าประมูล กดปุ่ม "เข้าร่วมประมูล" แล้วใส่จำนวนเงินที่ต้องการเสนอ ต้องสูงกว่าราคาปัจจุบันตามที่ระบบกำหนด'
  },
  {
    question: 'ชำระเงินยังไง',
    answer:
      'ระบบใช้ MockPaymentProvider จำลองการชำระเงิน เลือกวิธีชำระที่หน้า checkout แล้วกดยืนยัน ระบบจะแสดงสถานะสำเร็จ/ไม่สำเร็จทันที (เป็นระบบทดสอบ ไม่ใช่การชำระเงินจริง)'
  },
  {
    question: 'ติดตามสถานะจัดส่งได้ที่ไหน',
    answer:
      'ไปที่หน้า "ประวัติคำสั่งซื้อ" แล้วกดดูรายละเอียดออเดอร์ จะเห็น timeline สถานะจัดส่งล่าสุด'
  }
];

export function formatFaqContext(): string {
  return FAQ_KNOWLEDGE_BASE.map(
    (entry, index) =>
      `${index + 1}. Q: ${entry.question}\n   A: ${entry.answer}`
  ).join('\n');
}
