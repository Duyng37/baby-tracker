# Frontend — phạm vi bản thử đầu tiên

## Có gì trong repository?

Một package npm ở gốc, frontend `src/`, backend `supabase/`. Không dùng npm/pnpm
workspaces hay monorepo tooling. Giữ `wireframes/` độc lập để đối chiếu thiết kế.

- React + TypeScript strict + Vite; Vercel Node Functions làm BFF cho Auth/RPC.
- Auth Google qua Supabase PKCE phía server, phiên cookie HttpOnly; JS không nhận token mới.
  Thiết kế, migration và env server-only: [Auth/PWA](auth-pwa.md).
- Tạo gia đình/bé cần mạng; IDs và request nháp lưu trước network để retry an toàn.
- Chọn bé/gia đình, ghi bình/tã/bú mẹ/ngủ; kết thúc/đổi bên timer, ghi chú, xóa/hoàn tác.
- Tổng hợp 24 giờ gần nhất theo bé; lọc ngày nhật ký theo timezone gia đình.
- Tạo/nhận mã mời caregiver; token chỉ ở bộ nhớ UI, không vào IndexedDB hoặc URL.

## Ranh giới local-first và đồng bộ

- Database Dexie tách theo **project + user ID**. Không lưu session/key trong bảng app.
- `save()` kiểm tra scope, version, active timer và validate body rồi ghi event/outbox
  trong một transaction. UI chỉ báo lưu trên máy sau commit, không chờ HTTP.
- Mỗi intent có operation UUID. Request được đóng băng và persist **trước lần gửi đầu**;
  sửa tiếp tạo intent phụ thuộc, không thay nội dung request đang chờ phản hồi.
- ACK dùng revision của parent cho intent con, không tự rebase theo một remote edit mới.
- Server snapshot/revision được giữ riêng với body local. ACK cũ không hạ revision;
  pull không ghi đè overlay chưa ACK. Revision/cursor giữ dạng chuỗi và so bằng BigInt.
- Trang pull + cursor commit atomically; ACK cursor không thay pull cursor.
- Đổi tài khoản hủy worker; mỗi RPC có expected user/project. BFF kiểm tra trước khi
  dùng JWT người dùng; không thể gửi outbox A bằng quyền B. SQL/RLS vẫn giữ nguyên.
- Web Locks serialize sync giữa nhiều tab; nếu không được hỗ trợ thì dừng sync và báo rõ.
- Chạy khi mở app, online, foreground, sau ghi; kiểm tra định kỳ 30 giây. Lỗi dùng backoff
  có jitter tối đa 60 giây. Mỗi lượt gửi tối đa 100 intents, không giả ACK phần còn lại.
- Mất membership: ẩn family, giữ dữ liệu/outbox cách ly; không tự xóa. Thông báo nêu số pending.
- Conflict giữ cả intent local và response server, chặn intent phụ thuộc. Event khác vẫn gửi được.
- Đăng xuất cần mạng, giữ cache/outbox theo tài khoản. Web/PWA sao chép cùng cookie sẽ
  cùng mất phiên server; có thông báo trước khi xác nhận. Chưa có UI dọn cache.

## Giới hạn cần biết

- **Đã có manifest/icons, chưa có service worker**: ghi offline khi app đang mở đã có lớp dữ liệu,
  nhưng reload/khởi động app khi mất mạng chưa được hỗ trợ đầy đủ.
- Phiên Auth hết hạn khi offline: chưa hoàn tất luồng mở lại cache mà không có session
  hợp lệ. Không thể coi đây là offline-first MVP đã hoàn tất.
- Chưa có UI chọn bản thắng khi conflict/invalid, chỉnh giờ/ghi trước đó, biểu đồ 7/30 ngày,
  xuất/backup/restore hoặc UI thu hồi lời mời/thành viên. RPC thu hồi đã có ở backend.
- Tên vai trò/số thành viên có thật từ workspace; chưa có tên hiển thị từng người dùng.
- Preset lượng sữa là nút nhập nhanh, **không phải khuyến cáo y tế**.
- Cache trình duyệt chưa mã hóa riêng. Người có quyền truy cập thiết bị/profile trình duyệt
  có thể đọc cache; thu hồi membership không xóa ngay cache trên máy đang offline.
- Chưa có Realtime subscription. Polling/pull hiện dùng change log giữ toàn bộ, chưa compaction.
- Chưa chạy OAuth/JWT/PostgREST thực trên project của người dùng, browser E2E, nhiều tab
  thực hoặc iOS/Android. Chưa dùng dữ liệu thật, chưa deploy production.

## Kiểm thử

- `npm run test:client`: Vitest + fake-indexeddb kiểm tra transaction/rollback, reopen,
  account/project isolation, timer đồng thời, retry response mất, intent phụ thuộc,
  ACK cũ, conflict, scope bị thu hồi, cursor phân trang, tombstone, abort khi đổi account.
- Transport/BFF tests dùng giá trị giả: cookie, PKCE, CSRF, refresh lease, logout-in-flight,
  account/project binding, retry khôi phục phiên; không đọc credential thật vào test logs.
- React tests hiện là SSR markup/accessibility/escaping, **không phải browser E2E**.
- `npm test`: chạy cả legacy + client; `npm run test:legacy` chạy riêng 56 test wireframe/static.
- `npm run test:db`: PostgreSQL runtime suite trong container tạm, không kết nối remote DB.
- `npm run build`: typecheck + bundle; không thay thế các kiểm thử runtime ở trên.

Sau cấu hình project ở [setup](setup.md), ưu tiên test hai tài khoản độc lập, hai thiết bị,
offline/reconnect/expired session và xung đột; sau đó hoàn thiện PWA và UI còn thiếu.