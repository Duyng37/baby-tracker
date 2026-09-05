# Nôi — Baby Tracker

Baby tracker nhiều gia đình/nhiều bé. Định hướng: **ghi nhanh 1–2 chạm**, lưu trên
thiết bị trước rồi đồng bộ Supabase; frontend React/TypeScript và hosting Vercel.

## Tiến độ thực tế

- `wireframes/`: prototype 4 màn hình, dữ liệu giả trong bộ nhớ, chưa phải PWA.
- `supabase/migrations/`: mã backend PostgreSQL/RLS/RPC, **chưa áp dụng lên cloud**.
- `supabase/tests/backend.sql`: kiểm thử database bằng danh tính giả và transaction rollback.
- `tests/migrations.test.mjs`: kiểm tra tĩnh; **không thay thế chạy SQL/RLS**.
- `scripts/test-db.mjs`: chạy SQL trên container PostgreSQL mới, độc lập với dữ liệu thật.
- `src/`: frontend React/TypeScript, Google Auth PKCE, tạo gia đình/bé, lời mời,
  4 màn hình cơ bản, ghi nhanh và timer; IndexedDB/outbox + engine RPC.
- `api/`, `server/`: BFF phiên cookie HttpOnly, token vault mã hóa, CSRF/account binding;
  manifest/icons cho cài màn hình chính. [Cấu hình bản Auth/PWA mới](docs/auth-pwa.md).
- SQL integration suite đã chạy thành công trên PostgreSQL 17 trong container riêng.
- Người dùng đã deploy bản frontend cũ; **chưa kiểm thử bản BFF trên cloud/iPhone thật**.
- **Chưa có:** service worker/PWA offline reload, màn hình giải quyết conflict, backup/restore.
  UI chưa được kiểm thử E2E trình duyệt.

Chưa dùng dữ liệu bé thật cho tới khi vượt các cổng kiểm thử trong tài liệu kiến trúc.

## Kiểm tra

Cần Node.js 22.12+; đã kiểm tra với 22.22.0. Cài dependencies bằng `npm ci`.

- `npm test`: chạy cả bộ legacy và client.
- `npm run test:legacy`: các test wireframe và static guardrails cũ.
- `npm run test:client`: domain, IndexedDB, sync, render SSR và server cookie/HTTP/security.
- `npm run typecheck`: TypeScript strict.
- `npm run build`: kiểm tra kiểu và build Vite ra `dist`.
- `npm run dev`: frontend tại `http://127.0.0.1:5173/`.

Nếu chưa có `.env.local`, frontend hiển thị hướng dẫn cấu hình, **không giả lập cloud**.
Đọc [setup](docs/setup.md) để cấu hình project đã tạo. Không gửi key/secret qua chat.

`npm run test:db` cần Docker Engine đang chạy và image `postgres:17` đã có trên máy.
Runner **không tự tải image**, không nhận connection string, không mở cổng host,
không mount workspace vào database. Container và dữ liệu test được xóa sau khi chạy.
Auth fixture chỉ mô phỏng `auth.uid()`/bảng user, không kiểm thử Google OAuth/JWT.

Một lựa chọn khác: chạy `supabase/tests/backend.sql` trong **Supabase project kiểm thử riêng**,
sau khi áp dụng đủ bốn migration. Không chạy bộ fixture này trên production.

## Tài liệu

- [Kiến trúc và cổng nghiệm thu](docs/architecture.md)
- [Hợp đồng RPC và đồng bộ](docs/backend-contract.md)
- [Thiết lập Supabase, Google, Vercel và chi phí](docs/setup.md)
- [Cách xem wireframe](wireframes/README.md)
- [Phạm vi frontend và kiểm thử](docs/frontend.md)

## Cấu trúc repository

Một repository với một package npm ở gốc, **không dùng workspace/Nx/Turborepo**.
Frontend ở `src/`, backend SQL ở `supabase/`. Vercel build frontend từ thư mục gốc;
schema database được triển khai riêng lên Supabase, không tự chạy khi build Vercel.

## Bước tiếp theo

1. Áp dụng schema vào project Supabase thử nghiệm và cấu hình Google OAuth + `.env.local`.
2. Kiểm thử Auth/JWT/PostgREST với hai tài khoản; bổ sung database concurrency tests.
3. Hoàn thiện UI conflict, sửa giờ/ghi trước đó, báo cáo/xuất dữ liệu và quản lý quyền.
4. Thêm PWA, test offline reload/phiên hết hạn, E2E iOS/Android và backup/restore trước khi dùng thật.