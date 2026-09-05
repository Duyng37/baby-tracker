# ADR 001 — Cloud, nhiều gia đình, nhiều bé

**Trạng thái:** quyết định sản phẩm đã chốt ngày 2026-09-05; PostgreSQL local tests pass,
đã có frontend/IndexedDB/sync cơ bản, chưa kết nối/kiểm chứng project cloud.
**Thay thế:** phương án MVP chỉ local và đồng bộ cloud là tùy chọn ở giai đoạn sau.

## 1. Quyết định cốt lõi

- Một ứng dụng phục vụ nhiều gia đình độc lập (multi-tenant).
- Một gia đình có nhiều bé; một người có thể là thành viên nhiều gia đình.
- Cloud là nơi lưu trữ dùng chung và bản dữ liệu được server xác nhận.
- IndexedDB là bản làm việc trên thiết bị và hàng đợi ghi khi mất mạng; không phải bản sao lưu duy nhất.
- Tài khoản, cô lập gia đình và đồng bộ cloud nằm trong MVP, không để sang giai đoạn 2.
- Các thao tác ghi nhanh vẫn 1–2 chạm sau khi đã thiết lập tài khoản/gia đình/bé.
- Mỗi người dùng tài khoản riêng. Không chia sẻ mật khẩu của gia đình.

## 2. Stack đã chốt

| Thành phần | Lựa chọn |
| --- | --- |
| PWA | React + TypeScript + Vite, Workbox |
| Bản làm việc offline | IndexedDB qua Dexie, outbox cùng transaction |
| Tài khoản | Supabase Auth; ưu tiên Google OAuth, có thể bổ sung email OTP |
| Phiên web/PWA | Vercel BFF, HttpOnly cookie, encrypted token vault; xem ADR 002 |
| Cloud database | Supabase PostgreSQL, Row Level Security (RLS) |
| Ghi dữ liệu và đồng bộ | RPC/API theo quyền người gọi, có revision và idempotency |
| Thông báo thay đổi | Realtime để kích hoạt pull; không thay thế sync protocol |
| Hosting | Vercel Hobby cho mục đích cá nhân/phi thương mại; vùng Supabase đề xuất Singapore, cần người dùng xác nhận khi tạo project |

Đã cài React/TypeScript/Vite/Dexie/Supabase SDK và công cụ test sau khi được đồng ý.
Người dùng đã tạo project Supabase; agent chưa áp dụng migration cloud, deploy hay bật gói trả phí.
Workbox/service worker chưa được cài hoặc triển khai.
Không cần microservices. Một client modular, API đồng bộ và PostgreSQL là đủ cho MVP.
Auth/RPC đã chuyển qua BFF cùng origin, không dùng Supabase token trong JS của phiên mới.
[ADR 002](auth-pwa.md) ghi chi tiết cookie sao chép khi cài PWA, refresh lease, giới hạn
logout/offline và cấu hình triển khai. Manifest/icons đã có; service worker vẫn chưa có.

## 3. Quan hệ và dữ liệu

**User ↔ Membership ↔ Family → Baby → TrackingEvent → FeedingSegment.**

| Entity | Trường và ràng buộc chính |
| --- | --- |
| User profile | user_id tham chiếu Auth, display_name tối thiểu |
| Family | id UUID, name, created_at, deleted_at |
| Membership | family_id, user_id, role, status; UNIQUE(family_id, user_id) |
| Baby | id UUID, family_id, nickname, birth_date tùy chọn, revision, deleted_at |
| TrackingEvent | id UUID, family_id, baby_id, type, started_at, ended_at, payload đã validate, created_by, updated_by, revision, deleted_at |
| FeedingSegment | family_id, event_id, side, started_at, ended_at |
| Invitation | family_id, role, token_hash, expires_at, accepted_at, revoked_at; không lưu token thô |
| Sync operation | operation_id, user_id, device_id, family_id, base_revision, payload_hash, kết quả xử lý |
| Change log | family_id, cursor, entity_id, revision, action; gồm cả tombstone |
| Local preferences | user_id, family_id, selected_baby_id; đơn vị/preset theo bé |

- UUID tạo trên client cho hoạt động mới. Server kiểm tra tenant, không tin ID do client tự gửi.
- FK kép `(family_id, baby_id)` tham chiếu Baby và `(family_id, event_id)` tham chiếu Event: không ghép bé/sự kiện của gia đình khác.
- `family_id`, `baby_id`, `created_by` của sự kiện không được đổi bằng update thông thường.
- `created_by` lấy từ danh tính đã xác thực; không tin tên hay user_id gửi trong payload.
- Timestamp lưu UTC; ngày sinh là date; lưu timezone IANA của gia đình cho báo cáo theo ngày.
- Tách giờ xảy ra hoạt động khỏi giờ server nhận dữ liệu. Không dùng đồng hồ client để phân xử xung đột.
- Event và các đoạn bú được lưu atomically, cùng revision ở cấp cữ bú.

## 4. Phân quyền (deny by default)

| Hành động | Chủ gia đình | Người chăm sóc |
| --- | --- | --- |
| Xem dữ liệu bé và thống kê trong gia đình | Có | Có |
| Thêm/sửa/xóa hoạt động trong gia đình | Có, có audit | Có, có audit |
| Tạo/sửa hồ sơ bé | Có | Không |
| Mời/xóa thành viên, đổi quyền | Có | Không |
| Xuất nhật ký được phép xem | Có | Có |
| Xóa gia đình/chuyển quyền sở hữu | Có, xác thực lại | Không |

- Mỗi gia đình phải còn ít nhất một chủ. Chuyển quyền/thu hồi quyền qua transaction server.
- RLS kiểm tra membership đang active trên mọi bảng dữ liệu, không chỉ filter ở UI.
- Kiểm tra riêng SELECT/INSERT/UPDATE/DELETE và cả hàng trước/sau thay đổi.
- Endpoint mời, chấp nhận lời mời, quản lý quyền phải kiểm tra quyền phía server, giới hạn tần suất.
- Lời mời hết hạn, dùng một lần, có thể thu hồi; role do chủ gia đình cho phép, người nhận không tự nâng quyền.
- Không lộ tên bé hoặc metadata của gia đình chưa được phép truy cập.
- RPC phải có quyền tối thiểu, search_path cố định; không dùng service-role để bỏ qua quyền người dùng khi xử lý sync.
- Không đưa secret, service-role key, token đăng nhập/lời mời vào log, analytics, URL thiết kế hay mã frontend.

## 5. Lần đầu và các lần sau

### Lần đầu, cần mạng

**Đăng nhập → tạo gia đình + bé đầu tiên hoặc nhận lời mời → tải dữ liệu được phép xem → Hôm nay.**

Tạo gia đình, membership chủ và hồ sơ bé đầu tiên trong một transaction server, tránh dữ liệu nửa chừng.
Sau khi khởi tạo thành công, app nhớ gia đình/bé được chọn gần nhất trên thiết bị.
Không bắt xác nhận tài khoản lại ở mỗi lần ghi hoạt động.

### Đã thiết lập, đang offline

- Mở app bằng app shell đã cache; đọc dữ liệu thuộc tài khoản đã được thiết lập trên thiết bị.
- Ghi/đổi bên/kết thúc timer ngay trên máy; hiện số thay đổi chưa lên cloud.
- Không thể đăng nhập mới, tạo gia đình, thêm bé, mời/nhận lời mời khi không có mạng trong MVP.
- Token hết hạn lúc offline: giữ thay đổi pending, yêu cầu xác thực lại trước khi gửi server.
- Sau khi biết quyền đã bị thu hồi: khóa phạm vi đó; cách ly các thay đổi chưa gửi, không retry vô hạn hoặc tự xóa.
- Thu hồi quyền không thể xóa tức thì bản cache trên thiết bị đang offline. Phải công bố giới hạn này, không hứa bảo mật tuyệt đối.

## 6. Luồng ghi và đồng bộ

1. UI tạo operation có family_id/baby_id cố định theo ngữ cảnh tại thời điểm bấm.
2. Validate; transaction IndexedDB ghi sự kiện + outbox. Chỉ báo đã lưu thiết bị sau commit thành công.
3. Sync worker gửi theo thứ tự phụ thuộc của từng entity, dùng danh tính đang xác thực.
4. Server kiểm tra membership, FK, schema, base_revision và operation_id trong transaction.
5. Server cập nhật event, ghi change log/audit và lưu kết quả idempotency atomically.
6. Client nhận ACK: cập nhật server revision và đánh dấu operation đã nhận, không xóa các sửa đổi mới hơn còn pending.
7. Pull change log có phân trang/cursor theo gia đình; áp dụng dữ liệu đã xác nhận, giữ overlay local chưa gửi.

- Retry có backoff/jitter. Cùng operation_id + cùng payload trả lại kết quả, không ghi trùng; payload khác bị từ chối.
- Chạy sync khi mở app, foreground, mạng trở lại hoặc người dùng nhấn thử lại; không phụ thuộc Background Sync.
- Thứ tự hoàn tất request không được làm revision cũ ghi đè revision mới.
- Thay đổi và cursor phải dùng cơ chế server bảo đảm không bỏ sót commit; không dùng timestamp client hay sequence cấp trước commit một cách ngây thơ.
- Lần đầu dùng snapshot nhất quán với cursor; cursor hết hạn cần full resync nhưng giữ outbox chưa xử lý.
- Tombstone chỉ dọn theo chính sách retention/thiết bị; full resync không hồi sinh dữ liệu đã xóa.

### Xung đột

- Hai event độc lập: giữ cả hai.
- Hai update cùng event: optimistic concurrency bằng revision; giữ phiên bản local + server khi xung đột.
- Không tự chọn bản thắng cho lượng sữa, giờ hoặc xóa/sửa đồng thời. Cho người có quyền giải quyết rõ ràng.
- Mỗi bé có tối đa một phiên chạy cho mỗi loại timer đã được server chấp nhận.
- Hai thiết bị offline tạo timer cùng loại: server giữ phiên chính, phiên còn lại vào trạng thái conflict; không âm thầm bỏ dữ liệu.
- Hoàn tác sau khi server ACK là operation bù với revision mới, không rollback toàn bộ snapshot cloud.

## 7. UX đa bé và trạng thái cloud

- Chạm header → chọn bé: hai chạm. Bộ chọn nhóm bé theo gia đình mà người dùng là thành viên.
- Một gia đình/một bé được chọn tự động; không thêm bước chọn cho mọi lần ghi.
- Mọi bottom sheet ghi nhận, timer và file xuất đều có tên bé/ngữ cảnh gia đình.
- Chuyển bé không dừng timer. Có bộ điều khiển để tìm và kết thúc timer của bé khác trong gia đình hiện tại.
- Không tổng hợp lẫn chỉ số của nhiều bé. Bộ lọc, form và cache query có scope user/family/baby.

| Trạng thái thực tế | Nhãn đề xuất |
| --- | --- |
| Ghi local thành công, chưa có ACK | Đã lưu trên máy · N thay đổi chờ cloud |
| Đang gửi/pull | Đang đồng bộ… |
| Server đã nhận hết thay đổi | Đã đồng bộ · thời điểm xác nhận gần nhất |
| Mất mạng | Offline · ghi nhận vẫn hoạt động |
| Hết phiên | Cần đăng nhập lại · dữ liệu chưa gửi vẫn được giữ |
| Lỗi/xung đột | Chưa đồng bộ · thử lại / xem chi tiết |

Tuyệt đối không báo “đã lưu cloud” chỉ vì `navigator.onLine` là true hoặc đã gửi request.
Wireframe gắn chữ **mô phỏng** cho toàn bộ trạng thái; nút hoàn tất demo không thực hiện network write.

## 8. Dữ liệu nhạy cảm, sao lưu và vận hành

- HTTPS, RLS, nguyên tắc thu thập tối thiểu. Không có dữ liệu bé trong analytics/error report.
- Cloud không đồng nghĩa backup: phải cấu hình retention, phục hồi và thực hành restore trên môi trường kiểm thử.
- PITR/backup, dung lượng, vùng lưu trữ và chi phí cần kiểm tra theo gói dịch vụ khi triển khai; không hứa miễn phí/vĩnh viễn.
- Cho phép xuất/xóa dữ liệu đúng quyền. Chính sách xóa phải bao gồm tombstone, log và vòng đời backup.
- Local cache tách theo tài khoản; đăng xuất/đổi tài khoản phải cảnh báo dữ liệu chưa gửi và dọn cache theo lựa chọn rõ ràng.
- Không tự xóa pending writes. Nếu người dùng xác nhận bỏ dữ liệu, nêu rõ khả năng mất vĩnh viễn.
- Không quảng bá mã hóa đầu-cuối khi chưa thực sự triển khai quản lý khóa tương ứng.

## 9. Cổng nghiệm thu trước khi dùng dữ liệu thật

- Kiểm thử RLS bằng hai tài khoản/gia đình độc lập: không đọc/ghi/subscribe/export chéo tenant.
- Chặn giả family_id, baby_id, created_by, role và phát lại lời mời.
- Test nhiều bé cùng timer; đổi bé khi form mở không đổi đích ghi; hoàn tác không tác động bé khác.
- Test outbox atomic, offline reload, retry/idempotency, ACK đến sai thứ tự, conflict, reconnect.
- Test token hết hạn, quyền bị thu hồi, đăng xuất có pending, cache khi đổi tài khoản.
- Test bootstrap/cursor phân trang/tombstone/resync không mất hoặc hồi sinh dữ liệu.
- Test restore backup và migration; test thiết bị iOS/Android, accessibility, PWA thật.

## 10. Phân định tiến độ

**Hiện có:** prototype, ba SQL migration đã pass PostgreSQL local integration tests,
frontend React/Auth PKCE, onboarding và ghi nhanh, IndexedDB/outbox transactional,
sync RPC giữ request bất biến, overlay local, cursor và quarantine khi mất quyền.
**Chưa có:** kết nối Supabase thật, test JWT/PostgREST/concurrency nhiều connection,
Service Worker, UI xử lý conflict, backup/restore, browser E2E và deploy.
**Bước kế tiếp:** cấu hình project/Auth trên tài khoản người dùng, kiểm thử cloud thực;
hoàn thiện các phần frontend/PWA còn thiếu. Xem [setup.md](setup.md), [frontend.md](frontend.md).
Không gửi secret qua chat; cấu hình bằng cơ chế quản lý secret tại môi trường triển khai.

### Phạm vi backend đầu tiên so với kiến trúc đích

- Segments bú được giữ trong JSONB đã validate, cùng aggregate/revision event,
  thay vì bảng FeedingSegment riêng. FK family/baby vẫn được kiểm tra tại database.
- Bootstrap replay change log từ 0, có phân trang. Chưa có retention/compaction hay
  snapshot resync tối ưu; chưa được tự dọn log/ACK/tombstone.
- Lời mời hiện chỉ caregiver, token một lần/48 giờ và có thu hồi/throttling cơ bản;
  chưa tự gửi email. Chưa có chuyển chủ, xóa gia đình/tài khoản hay sửa hồ sơ.
- Metadata workspace refresh riêng; không bật Realtime trước khi kiểm thử quyền subscription.
- Client mới hiện thực một phần mục 5–7: offline ghi khi đang mở app, chưa offline reload;
  conflict được giữ/cách ly nhưng chưa có màn hình giải quyết, chưa đạt tất cả cổng nghiệm thu.
- Hợp đồng hiện tại và các giới hạn: [backend-contract.md](backend-contract.md).