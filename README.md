# DMS 4.0 Asakai Maintenance Dashboard

ระบบตัวอย่างสำหรับบันทึกใบแจ้งซ่อม/PM แม่พิมพ์และแสดง Dashboard KPI ผ่าน Browser หรือ GitHub Pages โดยใช้ LocalStorage เป็นฐานข้อมูลชั่วคราว

## ไฟล์หลัก
- `page_login.html` เลือกสิทธิ์ผู้ใช้
- `page_request_form.html` เปิดใบงาน BM/PM
- `page_job_queue.html` รับงานและปิดงาน
- `page_status_tracking.html` บอร์ดสถานะงาน
- `page_dashboard.html` Dashboard รายเดือนและกรองวันที่ย้อนหลัง
- `page_kpi_analytics.html` วิเคราะห์ KPI
- `page_die_master.html` ประวัติแม่พิมพ์และ Export CSV
- `data_engine.js` Logic คำนวณ KPI, MTTR, MTBF, Date Filter
- `app_ui.js` Animation, Page Transition, Button Ripple, Mobile Bottom Nav, Toast

## สิ่งที่ปรับในชุดนี้
- แก้การกรองวันที่ย้อนหลังให้ยึด `plannedDate`/วันที่แจ้งงานแบบเสถียร
- Dashboard ตั้งค่าเริ่มต้นเป็นเดือนปัจจุบัน ตั้งแต่วันที่ 1 ถึงวันสุดท้ายของเดือน
- เพิ่มช่อง Part Name, Part Number, Model ในหน้าแจ้งซ่อม
- แก้ไม่ให้บันทึก `partName` เป็น `Auto Part` อีกต่อไป
- รับงานแล้วบันทึกเวลาเริ่มงานอัตโนมัติ
- ปิดงานแล้วบันทึกเวลาและ downtime เป็นนาที
- Die Master แสดงข้อมูลแม่พิมพ์ทั้งหมด ไม่จำกัดแค่ Top 5
- เพิ่ม Animation เปลี่ยนหน้า, กดปุ่ม, Ripple effect, Toast และเมนูมือถือด้านล่าง

## วิธีเปิดใช้งาน
เปิด `index.html` หรือ `page_login.html` ผ่าน Browser ได้ทันที


## Update: Kanban Drag & Drop Board

ไฟล์ `page_status_tracking.html` ถูกปรับเป็น Kanban Board แบบลากการ์ดได้ 5 สถานะ:

1. รอรับงาน (`pending`)
2. กำลังซ่อม (`in_progress`)
3. รออะไหล่ (`waiting_parts`)
4. รอทดสอบ (`waiting_test`)
5. เสร็จสิ้น (`closed`)

เมื่อวางการ์ดข้ามช่อง ระบบจะบันทึกสถานะลง `localStorage` ทันทีผ่าน `saveJob()` ใน `data_engine.js` และถ้าลากไปช่อง `เสร็จสิ้น` ระบบจะบันทึกเวลา `closedAt`, `endTime`, `closedBy` และคำนวณ `downtimeMinutes` ให้อัตโนมัติ


## Production View Only Update

- หน้า Status Board / Kanban จำกัดสิทธิ์ฝ่ายผลิต (`production`) ให้ดูสถานะได้อย่างเดียว
- ฝ่ายผลิตไม่สามารถลากการ์ด เปลี่ยนสถานะ หรือปิดงานได้
- ผู้ที่แก้สถานะได้คือ `technician` และ `executive`
- ระบบยังคงใช้ Die/แม่พิมพ์เดิม ยังไม่เปลี่ยนเป็น JIG

---

## Google Sheet Database Mode

รอบนี้เพิ่มฐานข้อมูลหลักบน Google Sheet ผ่าน `google_apps_script.gs`

### ไฟล์ที่เพิ่ม/แก้
- `google_apps_script.gs` โค้ดสำหรับวางใน Google Apps Script
- `data_engine.js` เพิ่ม Cloud Sync ระหว่าง `localStorage` กับ Google Sheet
- `page_login.html` เพิ่มช่องตั้งค่า Google Sheet API URL

### วิธีตั้งค่า Google Sheet
1. สร้าง Google Sheet ใหม่
2. ไปที่ Extensions > Apps Script
3. ลบโค้ดเดิม แล้ววางโค้ดจากไฟล์ `google_apps_script.gs`
4. กด Save
5. ไปที่ Deploy > New deployment
6. เลือก Type: Web app
7. Execute as: Me
8. Who has access: Anyone
9. กด Deploy แล้วคัดลอก Web app URL
10. เปิดเว็บ DMS หน้า Login แล้ววาง URL ในช่อง Google Sheet API URL
11. กด “บันทึก URL”
12. กด “ส่งข้อมูล” ถ้าต้องการส่งข้อมูล localStorage เดิมขึ้น Sheet
13. กด “ดึงข้อมูล” ถ้าต้องการโหลดข้อมูลจาก Sheet ลงเครื่อง

### หลักการทำงาน
- ถ้าไม่มี API URL ระบบยังทำงานด้วย `localStorage` เหมือนเดิม
- ถ้ามี API URL ทุกครั้งที่สร้าง/แก้/ปิดใบงาน ระบบจะส่งข้อมูลไป Google Sheet อัตโนมัติ
- ตอนเปิดหน้า ระบบจะพยายามดึงข้อมูลจาก Google Sheet มารวมกับข้อมูลในเครื่อง


## Google Sheet API ที่ตั้งค่าไว้แล้ว

โปรเจกต์นี้ตั้งค่า Google Apps Script Web App URL เป็นค่าเริ่มต้นแล้ว:

```text
https://script.google.com/macros/s/AKfycbyneqZah0eShidCeljYAdX5WVQlJSIVN52AtdWaAk7Hj-7_MbKMxhIoqMHKaSA9muXr0g/exec
```

ถ้าต้องการเปลี่ยน URL ใหม่ ให้เปิดหน้า Login แล้วแก้ในช่อง Google Sheet API URL ได้ตามเดิม

## Patch: Bugfix 2026-06-29

รอบนี้แก้บัคหลักสำหรับ Google Sheet และ Dashboard:

1. แก้ Timezone จาก Google Sheet
   - ค่าแบบ `2026-06-28T17:00:00.000Z` จะถูกแปลงเป็นวันที่ไทย `2026-06-29`
   - ลดปัญหากราฟไม่ขึ้นวันที่ 29 เพราะข้อมูลถูกมองเป็นวันที่ 28

2. แก้ Dashboard/KPI ให้ใช้วันปิดงาน
   - งานที่ `status = closed` จะอิง `closedAt` หรือ `endTime` ก่อน `plannedDate`
   - เปลี่ยนวันจบงานแล้วกราฟและ KPI จะตามวันจบงาน

3. แก้ downtimeMinutes จาก Google Sheet
   - รองรับค่าที่มาจาก Sheet เป็น string เช่น `"13"`
   - ถ้าปิดงานจาก Kanban แล้ว start/end เท่ากัน ระบบ fallback จาก `requestAt` เพื่อไม่ให้ Repair Mins เป็น 0 ปลอม

4. แก้ Job Queue
   - ปิดงานจาก Modal แล้ว `closedAt` ใช้เวลาจบงานจริง ไม่ใช่เวลาปัจจุบัน
   - Production เข้า Queue ได้แบบดูอย่างเดียว ไม่สามารถรับงาน/ปิดงาน/ลบงาน
   - ลบใบงานได้เฉพาะ Executive

5. แก้การ Refresh หลังดึงข้อมูลจาก Google Sheet
   - Dashboard, KPI, Reliability, Calendar, Queue, Status Board จะ refresh หลัง `pullJobsFromSheet()` สำเร็จ

6. แก้ Google Apps Script
   - เพิ่ม Lock ป้องกันเขียนชนกัน
   - รองรับทั้ง FormData และ JSON POST
   - ส่ง Date กลับเป็นเวลาไทย ไม่ใช่ UTC ที่ทำให้วันเลื่อน

หมายเหตุ: ถ้าใช้ Google Sheet อยู่แล้ว ควรนำไฟล์ `google_apps_script.gs` เวอร์ชันนี้ไปวางทับใน Apps Script แล้ว Deploy ใหม่ด้วย
