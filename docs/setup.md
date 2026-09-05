# Thiết lập và chi phí

Kiểm tra thông tin gói dịch vụ ngày **2026-09-05**. Giá/hạn mức có thể thay đổi.
Đã có frontend React và migration; SQL tests chạy thành công trên PostgreSQL 17 local.
Project production đã áp dụng đủ năm migration, gồm `202609050005_profile_names.sql`
ngày 2026-09-05; kiểm tra dry-run xác nhận không còn migration chờ. Đăng nhập BFF đã được
người dùng xác nhận; cấu hình project mới theo [hướng dẫn Auth/PWA](auth-pwa.md).

## 1. Có thể dùng miễn phí không?

**Có thể bắt đầu ở 0 USD/tháng**, cho dự án cá nhân nhỏ trong hạn mức. Không phải
cam kết miễn phí vĩnh viễn hoặc bảo đảm uptime/backup.

| Dịch vụ | Gói khởi đầu | Điều cần lưu ý |
| --- | --- | --- |
| Vercel Hobby | 0 USD | Chỉ cá nhân, phi thương mại; vượt hạn mức có thể bị giới hạn/tạm dừng |
| Supabase Free | 0 USD | 500 MB database, 50.000 MAU, 5 GB egress, 1 GB storage; tối đa 2 project active |
| Supabase Pro | Từ 25 USD/tháng | Chỉ nâng cấp nếu bạn quyết định; compute/add-on/usage có thể tăng tổng tiền |
| Google OAuth cơ bản | Không cần SMTP | Tạo OAuth client và cấu hình consent; không cần bật dịch vụ Google trả phí cho đăng nhập cơ bản |
| Domain riêng | Tùy chọn, thường có phí | Dùng subdomain `vercel.app` trước |
| Email OTP/magic link | Chưa dùng | Cần custom SMTP cho người dùng thực; provider có free tier hoặc tính phí |
| Backup nâng cao/PITR | Không nằm trong Free | Cloud sync không thay thế backup; cần kế hoạch xuất/khôi phục dữ liệu |

Supabase Free có thể pause project sau **một tuần không hoạt động** và không có
automatic backups. Database trên 500 MB có thể chuyển read-only; app sau này phải
giữ outbox chờ gửi, không báo thành công giả. Log sync/idempotency cũng chiếm dung
lượng, không chỉ riêng nhật ký bé. Chưa triển khai retention/garbage collection.

Supabase SMTP mặc định hiện chỉ gửi tới email thành viên project, giới hạn thấp
(tài liệu nêu 2 thư/giờ), không phù hợp đăng nhập email cho bạn bè. MVP ưu tiên
Google OAuth và mã mời gia đình dùng một lần, chưa tự gửi email lời mời.

Nguồn: [Supabase Pricing](https://supabase.com/pricing),
[database quota](https://supabase.com/docs/guides/platform/database-size),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Vercel Hobby](https://vercel.com/docs/plans/hobby),
[Vercel Fair Use](https://vercel.com/docs/limits/fair-use-guidelines).

## 2. Việc bạn có thể làm ngay

1. Tạo tài khoản tại [Supabase](https://supabase.com/dashboard).
2. Tạo organization/project **Free** cho thử nghiệm. Đề xuất Singapore nếu gia đình ở Việt Nam.
3. Lưu mật khẩu database trong password manager của bạn. Không gửi qua chat/git.
4. Không bật Pro, PITR, custom Supabase domain hay add-on trả phí ở bước này.
5. Image `postgres:17` đã được tải với sự đồng ý của bạn; Docker tests đã pass.
   Khi chạy lại, mở Docker Desktop và dùng `npm run test:db`; không tác động project cloud.

Không cần đưa bạn bè vào Supabase Dashboard: họ là **người dùng app**, không phải
thành viên quản trị dự án. Mỗi gia đình dùng chung một backend, không tạo một
Supabase project cho mỗi gia đình.

## 3. Áp dụng schema lên project kiểm thử mới

Chỉ làm sau khi kiểm tra migration và xác nhận đúng project trống. Mỗi file có
transaction riêng; không chạy lại file đã áp dụng và không xóa bảng để xử lý lỗi.
Nếu project đã có schema ứng dụng, dừng và rà soát trước.

Trong SQL Editor, chạy theo thứ tự:

1. `supabase/migrations/202609050001_schema.sql`
2. `supabase/migrations/202609050002_families.sql`
3. `supabase/migrations/202609050003_sync.sql`
4. `supabase/migrations/202609050004_server_sessions.sql`
5. `supabase/migrations/202609050005_profile_names.sql`

Khuyến nghị dùng Supabase CLI để lưu lịch sử: xem `migration list`, `db push --dry-run`,
sau khi xác nhận đúng project mới `db push`. Không push lại schema từng chạy thủ công.
`supabase/tests/backend.sql`, `supabase/tests/profile-names.sql` và
`supabase/tests/server-sessions.sql` chỉ dành cho database test.

Project đã áp dụng bốn migration đầu chỉ cần migration `202609050005_profile_names.sql`
để bật đổi tên hồ sơ; triển khai BFF/frontend tương ứng. Không chạy lại schema cũ.

Không chạy `scripts/test-auth-bootstrap.sql` trên Supabase; đó chỉ là auth fixture
cho container PostgreSQL độc lập. Đọc kết quả test cuối; không gửi log chứa key,
JWT, email, mã mời hay dữ liệu bé vào chat. Chỉ cần báo pass/fail và mã lỗi không nhạy cảm.

SQL Editor không ghi lịch sử migration như Supabase CLI. Nếu chuyển sang CLI sau,
cần đối chiếu/đánh dấu migration đã áp dụng, không push lại mù quáng.

## 4. Đăng nhập Google — bước cần tài khoản của bạn

Server đã có Google OAuth PKCE; cấu hình để kiểm thử:

1. Trong Google Cloud Console, tạo project/OAuth consent cho app và OAuth client loại Web.
2. Trong Supabase → Authentication → Providers → Google, bật Google.
3. Lấy **callback URL do Supabase hiển thị** và thêm chính xác vào Authorized redirect URIs của Google.
4. Nhập Google Client ID/Client Secret trực tiếp vào Dashboard Supabase, không vào mã frontend.
5. Nếu consent còn ở Testing, thêm email người thử vào Test users; hoàn thiện Publishing khi mở rộng.
6. Supabase → URL Configuration: local Site URL `http://127.0.0.1:5173/`, Redirect URL
   `http://127.0.0.1:5173/api/auth?action=callback`. Nếu dùng localhost thì cấu hình riêng.
   Production: Site URL là origin Vercel, redirect là origin + `/api/auth?action=callback`.
   Không dùng wildcard rộng hoặc tự động cho mọi preview domain.

Supabase callback của Google và URL app sau đăng nhập là **hai URL khác nhau**.
Server dùng PKCE, không log callback URL/query/token; không cache response Auth/RPC.

## 5. Cấu hình local và Vercel

Cấu hình trực tiếp trên máy, không gửi giá trị qua chat:

- `VITE_SUPABASE_URL`: URL project, frontend dùng để tách namespace IndexedDB.
- Server: `APP_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
  `SESSION_ENCRYPTION_KEY` theo [bảng cấu hình Auth/PWA](auth-pwa.md).
- Local: tạo `.env.local` từ `.env.example`; các file môi trường thật đã được gitignore.
- `VITE_*` được nhúng vào bundle trình duyệt, **không phải kho secret**.
- Không đưa secret/database password/Google Client Secret vào frontend hoặc biến `VITE_*`.
  BFF cần Supabase secret key **server-only**; không gửi giá trị qua chat/git/log.

Chạy `npm run dev`, mở `http://127.0.0.1:5173/`. Sau khi sửa `.env.local`, dừng và
khởi động lại dev server. Không cấu hình đủ thì app chỉ hiển thị hướng dẫn, không gọi cloud.
Lần đầu đăng nhập/tạo hồ sơ/pull cần mạng. Sau đó có thể thử ngắt mạng trong khi app
đang mở: thao tác ghi phải tăng số pending; kết nối lại phải nhận ACK rồi giảm pending.
**Chưa có service worker**, nên offline reload/khởi động offline chưa phải tính năng đã hoàn tất.

Vercel: preset **Vite**, Root Directory để gốc repository, build `npm run build`, output `dist`.
Đặt đủ biến frontend và server trong Vercel Environment Variables rồi redeploy.
`api/` được triển khai thành Node Functions; `vite preview` không mô phỏng BFF production.
Deploy Vercel **không tự chạy SQL migration**. Chưa deploy production trước khi đạt các cổng test.

## 6. Cổng kiểm thử trước khi dùng thật

- SQL/RLS bằng 2 gia đình độc lập; thêm test RPC qua JWT/PostgREST thực.
- Test nhiều connection: trùng operation ID, trùng event ID chéo tenant, thứ tự commit/cursor,
  đồng thời tạo timer, nhận/thu hồi lời mời và xóa membership.
- Test Auth hết hạn, account switch, quyền bị thu hồi và outbox được cách ly.
- Test offline reload, lưu thất bại, retry, ACK cũ, conflict và tombstone.
- Có quy trình backup và phục hồi đã thử; chưa coi export UI là database backup.
- PWA trên iOS/Android; không có analytics hoặc log chứa dữ liệu bé/mã mời/session.