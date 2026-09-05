# Nôi — Baby Tracker wireframe 02

Prototype mobile-first, bằng HTML/CSS/JavaScript thuần, không dependency và không cần build.
Đây là bản thiết kế tương tác, **không phải ứng dụng PWA đã hoàn thiện**.

**Đã chốt:** nhiều gia đình, mỗi gia đình nhiều bé; cloud là lưu trữ chính từ MVP.
Kiến trúc chi tiết: [ADR 001 — Cloud và multi-tenant](../docs/architecture.md) (đường dẫn trong repository).
Auth, cloud và quyền server **chưa triển khai thật**. Bộ đếm pending/ACK chỉ để thử UX, không phải outbox bền vững.

## Xem bản mẫu

Từ thư mục gốc repository, chạy `python -m http.server 4173 --bind 127.0.0.1 --directory wireframes`.

Mở **http://127.0.0.1:4173/** bằng trình duyệt hiện đại.
Không mở HTML bằng `file://`, vì JavaScript module cần được phục vụ qua HTTP.
Server chỉ phục vụ thư mục wireframes, chỉ lắng nghe localhost, không mở ra mạng LAN.

## Bốn màn hình

| Màn hình | Cấu trúc | Tương tác |
| --- | --- | --- |
| Hôm nay | Chọn gia đình/bé, timer có tên bé, tóm tắt, hoạt động gần đây, ghi nhanh cố định | Chuyển bé, bú mẹ trái/phải, bình sữa, ngủ, tã, kết thúc timer đúng bé |
| Nhật ký | Chọn ngày, bộ lọc, tổng ngày, timeline mới nhất trước | Xem chi tiết, thêm trước đó, sửa, xóa, hoàn tác |
| Tổng quan | Hôm nay/7/30 ngày, bốn chỉ số, biểu đồ ngủ, xuất nhật ký | Đổi khoảng thống kê, xuất CSV dữ liệu giả lập |
| Gia đình | Các bé, vai trò thành viên, lưu cloud, xuất dữ liệu, giao diện | Tạo/đổi gia đình, thêm bé, nhận lời mời demo, trạng thái sync, JSON theo bé |

Trên desktop, cột trái giải thích ý đồ thiết kế của màn hình đang xem.
Trên điện thoại, phần preview hiển thị trước, ghi chú nằm bên dưới.

## Quy tắc 1–2 chạm

- Ngủ: **Ngủ** để bắt đầu; **Đã thức** để kết thúc, mỗi thao tác một chạm.
- Bú mẹ: **Bú mẹ → Trái / Phải** để bắt đầu; đổi bên/kết thúc một chạm từ timer.
- Bình: **Bình sữa → 60 / 90 / 120 ml** để ghi lượng đã uống.
- Tã: **Thay tã → Ướt / Bẩn / Cả hai** để ghi.
- Bốn nút cố định phía trên thanh điều hướng, không bị timeline đẩy khỏi màn hình.
- Timer vẫn điều khiển được khi đang xem các tab khác.
- Header → chọn bé: hai chạm; có tên gia đình phân nhóm, không hỏi lại bé ở mỗi lần ghi.
- Các bottom sheet ghi nhận đều có tên bé/gia đình. Thống kê không gộp các bé.
- Timer của bé khác trong gia đình hiện tại vẫn hiển thị ở thanh dưới; quá hai timer có nút xem tất cả.
- Sau thay đổi, thông báo có **Hoàn tác** trong 12 giây, áp dụng cho thay đổi gần nhất.
- Chuyển bé/gia đình đóng form và xóa thông báo hoàn tác cũ; thao tác timer chéo bé hoàn tác đúng hồ sơ gốc.
- Sửa thời gian, ghi chú, nhập lượng khác hoặc đổi loại sữa là các đường chi tiết có thêm thao tác.
- Tự chọn lượng sữa, bên bú hay tự tạo sự kiện thay người dùng đều không được áp dụng.

## Kịch bản để duyệt thiết kế

1. Mở Hôm nay: Mây đang ngủ từ 14:08, đồng hồ minh họa bắt đầu lúc 14:32.
2. Chọn Đã thức, kiểm tra mục mới và Hoàn tác.
3. Chọn Bình sữa → 90 ml, sang Nhật ký xem dữ liệu vừa ghi.
4. Chạm bản ghi, chọn Chỉnh sửa, đổi lượng sữa hoặc thêm ghi chú.
5. Chọn Bú mẹ → Trái, đổi bên, chuyển tab rồi kết thúc ở thanh timer phía dưới.
6. Bật Mô phỏng offline: ghi nhận vẫn thao tác được; không có mạng thật bị ngắt.
7. Bật Ban đêm và thử bottom sheet, biểu đồ, các form.
8. Chọn Chưa có dữ liệu để xem empty state trên ba màn hình đầu.
9. Chọn 30 ngày trong Tổng quan: app ghi rõ chỉ 7/30 ngày có dữ liệu mẫu.
10. Chạm tên Mây ở header → Bông: chỉ thấy nhật ký Bông, timer Mây vẫn chạy.
11. Ghi bình sữa cho Bông, chuyển lại Mây: dữ liệu mới không bị trộn vào nhật ký Mây.
12. Chọn Nhà của Bin: chỉ thấy Bin; tài khoản demo là người chăm sóc, không thể thêm bé/mời người khác.
13. Bấm Lần đầu sử dụng → tài khoản demo → tạo gia đình + bé đầu tiên hoặc nhận lời mời mẫu của Nhà của An.
14. Trong Gia đình, thêm bé mới (cần quyền chủ), ghi hoạt động và xuất JSON/CSV riêng bé đó.
15. Sau khi ghi, header có N thay đổi chờ cloud. Mở trạng thái → hoàn tất đồng bộ mô phỏng; không có upload thật.
16. Offline chặn đăng nhập mới/tạo gia đình/thêm bé/mời thành viên, nhưng không chặn nhật ký đã có.

Nút Đặt lại khôi phục toàn bộ hai gia đình demo và lựa chọn Mây; giữ tab, theme và chế độ offline.
Nút Chưa có dữ liệu cũng khôi phục hai gia đình demo nhưng làm trống nhật ký của các bé.
Tải lại trang sẽ đặt lại toàn bộ phiên prototype.

## Dữ liệu và giới hạn

- Tất cả gia đình, thành viên và hồ sơ Mây/Bông/Bin/An là giả lập. Không nhập dữ liệu thật/nhạy cảm.
- Mọi thay đổi chỉ ở bộ nhớ của trang; đóng hoặc tải lại sẽ mất thay đổi.
- Timer tính từ mốc thời gian, không cộng dồn theo số lần chạy interval.
- Đồng hồ minh họa bắt đầu lúc 14:32 ngày hiện tại để các kịch bản nhất quán.
- Thống kê ngủ phân bổ qua nửa đêm; timeline đặt sự kiện ở ngày bắt đầu.
- Cữ bú có nhiều đoạn giữ nguyên lịch sử đổi bên. Prototype chỉ cho sửa ghi chú của cữ nhiều đoạn.
- CSV/JSON chỉ xuất nhật ký của bé đang chọn, có định danh gia đình và bé; chưa có import phục hồi.
- Không có IndexedDB, Service Worker, manifest, background sync, push hoặc xác thực.
- Nhãn offline/cloud là mô phỏng UX, không bảo đảm mở lại trang khi offline hoặc khôi phục từ cloud.
- Thêm gia đình/bé và nhận lời mời mẫu chỉ cập nhật bộ nhớ. Không có email/token thật.
- Quyền trong model frontend chỉ để kiểm thử luồng; không phải bảo mật production hay thay thế RLS.
- Các gia đình trong bộ chọn đều là gia đình tài khoản demo đã có membership, không phải gia đình người lạ.
- Hồ sơ trong prototype chỉ thêm tên, chưa sửa ngày sinh. Đơn vị đo và gửi lời mời thật chưa có.
- Không có external font, CDN, analytics, API hoặc ảnh từ bên ngoài.

## Kiểm thử

Chạy từ thư mục gốc với Node.js 22+: `node --test wireframes/tests/model.test.mjs wireframes/tests/workspace.test.mjs wireframes/tests/render.test.mjs`.

- Model tests: timer, đổi bên, chặn phiên trùng, kiểm tra dữ liệu, chỉnh sửa, hoàn tác bằng snapshot, phân bổ ngủ qua nửa đêm.
- Workspace tests: tách dữ liệu từng bé/gia đình, quyền chủ/người chăm sóc ở mức demo, lựa chọn đã nhớ, export đúng scope và pending/ACK mô phỏng.
- Render tests: chạy logic tạo HTML và event handler với DOM doubles; kiểm tra bốn màn hình, luồng ghi nhanh, form và nhãn mô phỏng.
- **Render tests không phải browser E2E** và không kiểm tra layout, focus thực tế, touch hay download trong trình duyệt.
- Kiểm tra cú pháp: `node --check wireframes/app.mjs`, `node --check wireframes/model.mjs` và `node --check wireframes/workspace.mjs`.

### Checklist duyệt giao diện thủ công

- Kích thước 360 × 800, 390 × 844, 414 × 896 và desktop 1440 × 900.
- Không cuộn ngang toàn trang; nút ghi nhanh luôn nhìn thấy trong khung app.
- Điều hướng bằng Tab, mở/đóng dialog bằng bàn phím; Escape đóng, focus quay lại vị trí hợp lý.
- Chế độ tối có tương phản chữ rõ và icon không là tín hiệu duy nhất.
- Font hệ thống phóng to 200% không làm mất khả năng thao tác.
- Bú mẹ và ngủ cùng chạy vẫn kết thúc được từ tất cả các tab.
- Mây/Bông cùng có timer: nút Đã thức chỉ tác động bé ghi trên timer, không phụ thuộc bé đang xem.
- Khi đổi gia đình không hiện lịch sử/timer của gia đình trước; tên dài không tràn layout.
- CSV/JSON tải được và chỉ chứa dữ liệu demo.

## Cấu trúc file

- `index.html`: khung studio, preview, navigation và dialog.
- `styles.css`: token, layout responsive, component và theme.
- `app.mjs`: render bốn màn hình, form, điều hướng, tương tác demo và export.
- `model.mjs`: logic nghiệp vụ thuần, dữ liệu minh họa.
- `workspace.mjs`: gia đình, thành viên, bé, lựa chọn, export và trạng thái cloud mô phỏng.
- `tests/`: unit tests và render/event-handler smoke tests không cần trình duyệt.

## Bước sau khi duyệt

1. Chốt provider cloud (đề xuất Supabase), vùng dữ liệu, auth và các luồng wireframe mới.
2. Triển khai schema multi-tenant, Auth/RLS và kiểm thử cách ly tài khoản/gia đình trên backend.
3. Chuyển sang React/TypeScript; thêm IndexedDB/outbox, sync API có revision/idempotency và trạng thái ACK thật.
4. Thêm PWA app shell, backup/restore; kiểm thử offline, xung đột và trình duyệt/thiết bị thật trước khi dùng dữ liệu thật.