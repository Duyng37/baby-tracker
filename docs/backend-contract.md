# Hợp đồng backend — bản đầu

**Trạng thái:** năm migration và SQL integration assertions đã pass trên PostgreSQL 17
local với auth fixture. Chưa kiểm chứng Supabase Auth/JWT/PostgREST thực hoặc race nhiều connection.
Không phải chứng nhận production. Đọc [setup](setup.md) trước khi áp dụng schema.

## Phạm vi và phân quyền

- `families`, `family_members`, `babies`, `tracking_events`: chỉ được SELECT khi có membership.
- Client không có INSERT/UPDATE/DELETE trực tiếp, kể cả với hàng thuộc gia đình mình.
- RPC ghi là `SECURITY DEFINER`, cố định `search_path`, kiểm tra `auth.uid()` và membership
  trước khi thao tác. Vì definer có thể vượt RLS, các kiểm tra RPC là một lớp bảo mật bắt buộc,
  không được bỏ chỉ vì bảng đã bật RLS. Frontend không sử dụng service-role; BFF vẫn gọi
  12 RPC nghiệp vụ bằng JWT người dùng, có kiểm tra expected user/project trên mỗi request.
- `private`: outbox ACK server, change log, lời mời, rate counter; không expose qua Data API.
  Chỉ helper membership được cấp execute cho authenticated để policy SELECT dùng được.
- Chủ gia đình tạo/đổi tên hồ sơ/mời/thu hồi; caregiver được ghi nhật ký. Không có RPC tự nâng vai trò.
- Chưa có API chuyển chủ, xóa gia đình/tài khoản hoặc garbage collection.

## Các RPC

Tham số và chữ ký chính xác nằm trong migration; tên dưới đây cũng là tên gọi
`supabase.rpc(...)` phía BFF; frontend gọi `/api/rpc` cùng origin bằng cookie HttpOnly.

| RPC | Đầu vào chính | Hành vi |
| --- | --- | --- |
| `create_family` | UUID gia đình + bé, tên, nickname, timezone, ngày sinh tùy chọn | Tạo family/owner/baby trong một transaction; retry giữ nguyên IDs và nội dung |
| `add_baby` | family ID, baby UUID, nickname, ngày sinh | Owner-only; retry cùng ID/nội dung không tạo trùng |
| `rename_family` | family ID, tên mới, tên lúc mở form (`p_expected_name`) | Owner-only; tên 1–80 ký tự sau trim; trả `updated` hoặc `conflict` nếu tên đã thay đổi |
| `rename_baby` | family ID, baby ID, nickname mới, `p_expected_nickname` | Owner-only; kiểm tra bé thuộc gia đình; cùng quy tắc tên và xung đột |
| `get_workspace` | Không | Snapshot metadata của các gia đình được phép, bé và membership; chưa gồm nhật ký |
| `create_invitation` | family ID | Owner-only, mã bearer dùng một lần/48 giờ, chỉ caregiver, tối đa 20 lần tạo mỗi giờ/gia đình |
| `list_invitations` | family ID | Owner-only; trả ID/trạng thái/hạn, không trả token/hash |
| `revoke_invitation` | family ID, invitation ID | Owner-only; thu hồi theo đúng family |
| `accept_invitation` | token nhập riêng | Trả `accepted`, `invalid_invitation` hoặc `rate_limited`; tối đa 20 lần thử/giờ/user |
| `remove_family_member` | family ID, user ID | Owner-only; không xóa chủ cuối cùng; hủy lời mời chưa dùng của người bị xóa |
| `apply_event` | operation/device/family/baby/event UUID, base revision, event body | Kiểm tra scope/revision, ghi atomically event + change log + kết quả idempotency |
| `pull_changes` | family ID, after cursor, limit 1–500 | Phân trang thay đổi gồm tombstone; mặc định 200; cursor dưới dạng chuỗi |

Đổi tên cần migration `202609050005_profile_names.sql` và BFF có allowlist tương ứng.
Client cần mạng, giữ nguyên ID/nhật ký và tải lại `get_workspace` sau khi gửi; không đưa
đổi tên vào outbox sự kiện. RPC khóa gia đình trước khi kiểm tra quyền/tên đang lưu.
Retry cùng tên đích trả `updated`; tên hiện tại khác cả tên cũ và tên đích trả `conflict`,
không ghi đè. Đây là kiểm tra theo giá trị tên, không phải hệ thống revision metadata.

Mã mời là credential: chỉ hiển thị cho người tạo và người nhận dự định. Không đưa
vào URL query, logs, analytics hay chat với agent. Database chỉ lưu SHA-256 của mã
ngẫu nhiên tạo từ hai UUID v4. Tạo lời mời không idempotent; nếu mất response, chủ
có thể xem danh sách/thu hồi và tạo lại. Nhận thành công nhưng mất response: refresh
workspace trước khi kết luận thất bại; phát lại mã đã dùng trả invalid.

## Event body

Chỉ chấp nhận đúng các khóa sau, không có `created_by`, `updated_by`, ID hay revision trong body:

| Khóa | Kiểu / yêu cầu |
| --- | --- |
| `type` | `bottle`, `diaper`, `sleep`, `breast`; không đổi type của event đã có |
| `started_at` | ISO 8601 có `T` và timezone offset hoặc `Z` |
| `ended_at` | ISO 8601 hoặc null; bottle/diaper phải null |
| `payload` | Object theo loại, không có khóa thừa |
| `note` | Chuỗi tối đa 500 ký tự, dùng chuỗi rỗng nếu không có ghi chú |
| `deleted` | Boolean; server tự đặt `deleted_at` khi nhận true |

Payload theo loại:

- Bottle: `amount_ml` là số dương ≤ 2000, `milk` là `breast_milk`, `formula` hoặc `mixed`.
- Diaper: `kind` là `wet`, `dirty` hoặc `mixed`.
- Sleep: object rỗng; `ended_at = null` là timer đang chạy.
- Breast: `segments` gồm 1–200 object có `side` (`left`/`right`), `started_at`, `ended_at`.
  Các đoạn phải nối liên tục, khớp đầu/cuối event; chỉ đoạn cuối được mở khi timer chạy.

Wireframe dùng một số tên field/value khác (`amount`, `expressed`, `startedAt`);
không gửi thẳng object demo lên API. Cần adapter/validation ở frontend thật.
Giới hạn 2000 ml là hàng rào dữ liệu, **không phải hướng dẫn y tế**.
Server cho lệch giờ tương lai tối đa 5 phút; client vẫn cần cảnh báo giờ chưa hợp lệ.

## Idempotency và conflict

- UUID tạo trên client. `operation_id` duy nhất trong một tài khoản; `device_id` ổn định cho installation.
- `base_revision = 0` để tạo; sửa/xóa/hoàn tác dùng revision đã ACK gần nhất của event.
- Revision/cursor trong kết quả RPC là chuỗi thập phân; client không ép sang Number mất chính xác.
- Request đã gửi lần đầu phải bất biến: retry nguyên operation ID, device ID, body và base revision.
- Server so SHA-256 của toàn bộ request chuẩn hóa; cùng operation ID/nội dung trả đúng kết quả cũ.
  Khác nội dung bị từ chối. Membership được kiểm tra trước cả việc đọc ACK cũ.
- Status `accepted`: event + revision + cursor + operation ID đã commit atomically.
- Status `conflict`, reason `revision`: trả event hiện tại hoặc null, không sửa dữ liệu.
- Status `conflict`, reason `active_timer`: trả thêm `active_event` trong đúng baby/family.
- Conflict cũng là kết quả idempotent. Giữ phiên bản local, cho người dùng quyết định;
  giải quyết bằng operation ID mới/revision mới, không tự retry bản sửa với revision cập nhật.
- Mỗi baby có tối đa một timer mở cho từng loại sleep/breast. Không gộp timer hai bé.
- Hoàn tác là thao tác bù: ví dụ `deleted = false` với revision tombstone hiện tại,
  không đưa server quay về snapshot cũ. Nếu có sửa đồng thời vẫn phải xử lý conflict.

## Cursor và bootstrap

1. Refresh `get_workspace` để lấy quyền hiện tại; cách ly outbox của scope bị thu hồi.
2. Với family mới trên thiết bị, bắt đầu `pull_changes` ở cursor **0**; không dùng
   `sync_cursor` trong metadata để nhảy qua dữ liệu chưa tải.
3. Áp dụng từng trang + lưu `next_cursor` trong cùng transaction IndexedDB.
4. Lặp khi `has_more`; giữ overlay local chưa ACK, không ghi đè bằng snapshot server cũ.
5. Khi mở app/foreground/reconnect, refresh workspace và pull từ cursor đã lưu.

**Cursor trong ACK không được dùng để nhảy pull cursor**: có thể còn sự kiện do
thiết bị khác ghi ở giữa. ACK cũ cũng không được hạ revision local/newer server.
Mỗi event gửi tuần tự; các sửa local mới hơn phải chờ ACK của thao tác phụ thuộc,
không làm thay đổi request đã từng gửi.

Root row family bị khóa đến hết transaction khi ghi; cursor tăng bằng UPDATE,
không dùng sequence toàn cục hoặc đồng hồ client. Một khóa event-ID bổ sung chặn
race cùng UUID giữa hai family; upsert còn có guard family/baby/base revision.

Phiên bản đầu **replay change log được giữ toàn bộ** để bootstrap; chưa có snapshot
compaction/cursor expiry/full-resync tối ưu. Không tự xóa log/tombstone/ACK: sẽ phá
idempotency hoặc khiến thiết bị offline hồi sinh bản đã xóa. Thiết kế retention
và snapshot có watermark là công việc tiếp theo khi có nhu cầu dung lượng.

## Lỗi và retry phía client

- `28000` hoặc HTTP 401: cần xác thực lại, giữ local/outbox.
- `42501` hoặc HTTP 403: khóa/cách ly family chưa gửi; không retry vô hạn hay tự xóa.
- `22023`: payload/scope/cursor không hợp lệ; không tự retry, cho sửa hoặc báo lỗi.
- `40001`: retry cùng request bất biến với backoff/jitter.
- Lỗi mạng/timeout/5xx: giữ pending; retry không được tạo operation ID mới.
- Invitation trả HTTP thành công nhưng status không phải `accepted` **không có nghĩa đã tham gia**.

Đã có unit/integration tests phía client bằng fake-indexeddb và transport giả lập.
Chúng không kiểm chứng offline reload trình duyệt, JWT/Auth thật, PostgREST, race nhiều
connection hoặc iOS/Android. Đây vẫn là cổng nghiệm thu trước khi dùng dữ liệu thật.