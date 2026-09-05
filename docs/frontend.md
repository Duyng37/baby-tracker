# Frontend — phạm vi bản thử đầu tiên

## Có gì trong repository?

Một package npm ở gốc, frontend `src/`, backend `supabase/`. Không dùng npm/pnpm
workspaces hay monorepo tooling. Giữ `wireframes/` độc lập để đối chiếu thiết kế.

- React + TypeScript strict + Vite; Vercel Node Functions làm BFF cho Auth/RPC.
- Auth Google qua Supabase PKCE phía server, phiên cookie HttpOnly; JS không nhận token mới.
  Thiết kế, migration và env server-only: [Auth/PWA](auth-pwa.md).
- Tạo gia đình/bé cần mạng; IDs và request nháp lưu trước network để retry an toàn.
- Chủ gia đình có thể đổi tên gia đình và từng bé trong màn Gia đình. Cần mạng/phiên hợp lệ;
  tải lại workspace sau khi lưu, không đổi ID/nhật ký. Tên đã đổi từ nơi khác sẽ báo xung đột.
- Chọn bé/gia đình, ghi bình/tã/bú mẹ/ngủ; kết thúc/đổi bên timer, ghi chú, xóa/hoàn tác.
- Các trường ngày/giờ ghi nhận mới điền sẵn ngày hôm nay và giờ hiện tại khi mở form,
  theo múi giờ gia đình; lịch dự kiến vẫn để trống, sửa bản ghi giữ thời điểm đã lưu.
- Bộ chọn giờ dùng cùng màu, bo góc và nút icon với bộ chọn ngày, không dùng popup giờ
  của hệ điều hành. Nhập trực tiếp `HH:mm` (hoặc 4 chữ số), hoặc chọn giờ/phút rồi bấm
  **Xong**; **Hủy**/Escape không đổi giá trị. Hỗ trợ phím mũi tên, Home/End và cả hai theme.
- Ghi ngủ có ngày/giờ bắt đầu và ngày/giờ thức giấc riêng. Mặc định **Bé vẫn đang ngủ**
  để timer tiếp tục chạy, không dùng thời điểm thức điền sẵn. Chọn **Bé đã thức** để bật
  các ô thức giấc với ngày/giờ hiện tại; có thể sửa cả hai thời điểm để ghi bù giấc qua đêm.
- Tab Hôm nay hiển thị “Ngày hôm nay”, tổng hợp theo bé từ đầu ngày đến hiện tại, không lấy 24 giờ lùi lại.
  Tab Nhật ký mặc định cùng ngày hôm nay; chọn ngày khác hiện “Tổng hợp ngày DD/MM/YYYY” và số liệu ngày đó.
  Chọn ngày cũ trong Nhật ký không ảnh hưởng ngày và số liệu của tab Hôm nay.
  Ranh giới ngày theo timezone gia đình; ngủ/bú mẹ qua nửa đêm chỉ cộng thời lượng trong ngày đó,
  gồm timer đang chạy nhưng không vượt quá hiện tại. Bộ lọc hoạt động chỉ lọc danh sách, không đổi tổng hợp ngày.
- Tạo/nhận mã mời caregiver; token chỉ ở bộ nhớ UI, không vào IndexedDB hoặc URL.
- PWA cache giao diện để mở lại khi mất mạng; xuất/khôi phục sao lưu JSON trong màn Gia đình.

## Chăm con

- Thứ tự tab: **Hôm nay → Nhật ký → Chăm con → Gia đình**. Thanh ghi nhanh vẫn dùng như trước.
- **Chăm con** gom bú mẹ, bình sữa, thay tã, ngủ, ăn uống, lịch thuốc, chiều cao/cân nặng,
  tắm, tummy time (nằm sấp), ngoài trời, trong nhà và đánh răng. Mọi ghi nhận thuộc bé đang chọn.
- Ăn uống lưu món/đồ uống và lượng dùng tùy chọn; số đo dùng cm/kg (nhập một hoặc cả hai);
  hoạt động có thời điểm và thời lượng tùy chọn. Sửa/xóa từ Nhật ký, xóa có Hoàn tác.
- Lịch thuốc lưu từng lần, trạng thái Dự kiến / Đã uống. Dự kiến xếp tăng dần, đã uống
  xếp giảm dần. Khi chuyển sang Đã uống phải xác nhận thời điểm thực tế, cập nhật cùng ID.
  Kế hoạch không tính là hoạt động đã làm; lần đã uống xuất hiện trong Nhật ký.
- Không gợi ý thuốc/liều dùng, không có nhắc tự động hay lịch lặp. Liều do gia đình nhập theo đơn.
- Các mục mới dùng cùng cơ chế lưu offline, outbox, kiểm tra xung đột và sao lưu JSON.
- **Triển khai:** áp dụng các migration còn thiếu theo thứ tự, đến
  `supabase/migrations/202609050007_care_events.sql`, trước frontend. Chưa tự áp dụng lên cloud.
  Đóng tab/PWA cũ rồi mở lại; client cũ không đọc được bốn loại event mới.

## Lịch tiêm chủng

- Trong **Chăm con → Lịch tiêm chủng**, xem lịch của bé đang chọn; đổi bé ở đầu trang.
- **Lên lịch tiêm** để nhập lịch dự kiến, hoặc **Ghi mũi đã tiêm** để ghi bù lịch sử.
  Nhập tên vắc-xin, ngày/giờ theo múi giờ gia đình; mũi số, nơi tiêm và ghi chú tùy chọn.
- Lịch dự kiến xếp ngày tăng dần, lịch đã tiêm xếp ngày giảm dần. Lịch qua ngày hẹn vẫn
  giữ trạng thái dự kiến, không tự suy đoán bé đã tiêm hay bỏ lỡ mũi.
- **Đã tiêm** trên một lịch hẹn mở form xác nhận thời điểm thực tế (mặc định hiện tại),
  cập nhật cùng bản ghi thay vì tạo mũi trùng. Có chỉnh sửa và xóa/hoàn tác.
- Chủ gia đình và người chăm sóc đều có thể ghi offline. Lịch dùng event/outbox, quyền
  gia đình, kiểm tra xung đột và sao lưu JSON hiện có; không tính vào thống kê sinh hoạt.
- Chưa gửi nhắc tự động, không đề xuất phác đồ hoặc thay thế chỉ định cơ sở tiêm chủng.
- **Triển khai:** áp dụng `supabase/migrations/202609050006_vaccinations.sql` trước bản
  frontend mới. Build Vercel không tự chạy migration. Đóng các tab/PWA cũ rồi mở lại;
  client cũ không đọc được event `vaccination`. Chưa tự áp dụng migration lên cloud.

## Giao diện & theme

- Dùng cùng ngôn ngữ thiết kế với wireframes: nền kem, xanh sage, icon SVG nét mảnh,
  card nhẹ, timeline và nhóm cài đặt. `src/styles.css` là nguồn token giao diện app;
  không đưa màu cố định vào component để tránh sót nền/chữ sáng trong dark mode.
- Theme đặt trên phần tử `html`, áp dụng cả đăng nhập, trạng thái lỗi, form, native
  date/select, dialog, thông báo và màu thanh trình duyệt. Mặc định theo hệ điều hành;
  lựa chọn thủ công lưu riêng trong localStorage (`noi:theme`, không chứa dữ liệu bé/phiên).
  Không có quyền localStorage vẫn đổi theme được; các tab nhận cập nhật qua storage event.
- Mục **Chế độ ban đêm** trong Gia đình là công tắc bật/tắt có `role="switch"` và
  `aria-checked`, dùng cùng theme với nút header; hỗ trợ bàn phím, reduced-motion và forced-colors.
- Focus chuột không tạo viền dày; focus bàn phím có outline 2px, input có border/halo
  dịu và hỗ trợ forced-colors. Input 16px tránh Safari tự zoom khi nhập.
- Nội dung có vùng cuộn riêng; thanh ghi nhanh/navigation nằm trong flex layout,
  không đè lên nội dung bằng fixed positioning. Màn hình thấp chuyển sang thanh ghi
  nhanh gọn; viewport rất thấp dùng cuộn trang. Có safe area và reduced motion.
- Chạm dòng nhật ký để ghi chú hoặc xóa; xóa vẫn có Hoàn tác. Bộ lọc nhật ký không
  ảnh hưởng màn Hôm nay. Thông báo lỗi của sheet nằm trong modal thay vì sau backdrop.
- Sheet giữ Tab/Shift+Tab bên trong, Escape/nút đóng trả focus về nút mở. Khi xóa
  dòng hoặc hoàn tác làm nút đang chọn biến mất, focus chuyển về vùng nội dung.

## Ranh giới local-first và đồng bộ

- Database Dexie tách theo **project + user ID**. Không lưu session/key trong bảng app.
- `save()` kiểm tra scope, version, active timer và validate body rồi ghi event/outbox
  trong một transaction. UI chỉ báo lưu trên máy sau commit, không chờ HTTP.
- UI sửa/xóa/hoàn tác so sánh nội dung trước khi ghi trong cùng transaction: ACK chỉ
  đổi metadata, thứ tự khóa hoặc cách viết timestamp không làm thất bại form đang mở.
  Thay đổi nội dung thật, scope bị thu hồi và conflict vẫn chặn ghi đè.
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

## Cài PWA và mở lại khi mất mạng

1. Mở app qua HTTPS, đăng nhập và đợi nhật ký đồng bộ khi có mạng. Trên iPhone chọn
   Chia sẻ → Thêm vào Màn hình chính; trên Android dùng mục cài ứng dụng của trình duyệt.
2. **Mở chính PWA vừa cài khi còn mạng** và đợi dữ liệu tải về. Cookie có thể được sao chép
   khi cài, nhưng IndexedDB/localStorage và cache của trình duyệt không được coi là đã sao chép.
3. Vào **Gia đình → Dùng khi mất mạng**, đợi báo giao diện đã được lưu. Có thể yêu cầu
   “Ưu tiên giữ dữ liệu trên máy”; trình duyệt có thể từ chối, quyền này không thay thế backup.
4. Khi mất mạng, mở lại app và chọn **Mở nhật ký trên thiết bị** nếu chưa kiểm tra được phiên.
   Ghi nhận được lưu local; tạo/đổi tên gia đình/bé, mời người và khôi phục từ tệp cần xác thực + mạng.
5. Kết nối lại → app kiểm tra phiên; nếu cần, đăng nhập đúng tài khoản cũ để tiếp tục đồng bộ.
   Chỉ báo đã đồng bộ sau khi cloud xác nhận, không coi tài khoản local là phiên hợp lệ.

- Service worker chỉ bật ở **production build**, không ở `npm run dev`. Cache gồm HTML,
  JS (cả lazy Account), CSS, manifest và icons; không cache Auth/RPC, callback, response riêng tư.
- HTML và assets dùng cùng một phiên bản cache. Bản mới đợi các tab/PWA cũ đóng; không ép reload
  khi người dùng đang nhập. Khi có thông báo cập nhật, đóng tất cả cửa sổ Nôi rồi mở lại.
- Dấu nhớ tài khoản chỉ gồm user ID/thời điểm xác nhận, tách theo project, tối đa 30 ngày;
  không chứa token. Logout/response xác nhận hết phiên xóa dấu nhớ, không xóa event/outbox.
  Lỗi mạng/503 chỉ chuyển sang local-only. Đăng nhập lần đầu hoặc hết dấu nhớ cần mạng.

## Sao lưu và khôi phục

- Mở **Gia đình → Sao lưu và khôi phục → Chuẩn bị tệp sao lưu → Tải bản sao lưu**.
  Xuất được khi offline; tệp JSON version 1 tối đa 10 MiB / 20.000 ghi nhận.
- Tệp chứa trạng thái event trên máy (cả chưa gửi/đã xóa), tên gia đình/bé trong scope đang
  khả dụng. Không chứa credential, quyền thành viên, lịch sử outbox hay dữ liệu cloud chưa tải.
  **Tệp không mã hóa**, hãy lưu ở nơi riêng tư và không gửi lên chat công khai.
- Chọn tệp để xem đối chiếu local trước, chưa ghi gì. Xác nhận khôi phục cần đúng user/project,
  có mạng và Web Locks; app đồng bộ/đối chiếu cloud trong cùng lock với worker trước khi nhập.
- Chỉ thêm IDs thiếu vào hồ sơ còn quyền. Không ghi đè nội dung khác, không hồi sinh bản đã xóa,
  không mở lại timer đang chạy trong tệp, không tái tạo gia đình/bé/quyền từ metadata tệp.
  Nhập lại không sinh event/outbox trùng. Tệp không dùng để chuyển sang tài khoản/project khác.
- Thêm event/outbox trong một transaction; lỗi quota hoặc hủy lúc nhập rollback cả lượt nhập.
  Đối chiếu cloud trước đó là đồng bộ bình thường, không rollback những ACK/pull đã hoàn tất.
  Sau khi nhập, ghi nhận mới vẫn cần cloud ACK; dữ liệu nhiều có thể cần nhiều lượt đồng bộ.

## Giới hạn cần biết

- Offline phụ thuộc cache còn trên **đúng trình duyệt/PWA**, storage không bị xóa và đã chuẩn bị
  khi có mạng. Không đảm bảo lưu vĩnh viễn; chưa nghiệm thu cold start trên iPhone/Android thật.
- Chưa có UI chọn bản thắng khi conflict/invalid, chỉnh giờ/ghi trước đó, biểu đồ 7/30 ngày,
  hoặc UI thu hồi lời mời/thành viên. RPC thu hồi đã có ở backend.
- Tên vai trò/số thành viên có thật từ workspace; chưa có tên hiển thị từng người dùng.
- Preset lượng sữa là nút nhập nhanh, **không phải khuyến cáo y tế**.
- Cache trình duyệt chưa mã hóa riêng. Người có quyền truy cập thiết bị/profile trình duyệt
  có thể đọc cache; thu hồi membership không xóa ngay cache trên máy đang offline.
- Chưa có Realtime subscription. Polling/pull hiện dùng change log giữ toàn bộ, chưa compaction.
- Đăng nhập production đã được người dùng xác nhận sau cấu hình BFF và migration 004.
  Chưa nghiệm thu toàn bộ sync/backup/offline đa thiết bị với backend thật. Browser UI regression
  bên dưới dùng API giả; đợt bổ sung PWA/backup chưa được deploy/nghiệm thu trên production.

## Kiểm thử

- `npm run test:client`: Vitest + fake-indexeddb kiểm tra transaction/rollback, reopen,
  account/project isolation, timer đồng thời, retry response mất, intent phụ thuộc,
  ACK cũ, conflict, scope bị thu hồi, cursor phân trang, tombstone, abort khi đổi account.
- Transport/BFF tests dùng giá trị giả: cookie, PKCE, CSRF, refresh lease, logout-in-flight,
  account/project binding, retry khôi phục phiên; không đọc credential thật vào test logs.
- `src/data/backup.test.ts`: schema/file size, scope, chống ghi đè/trùng, rollback, hủy và 20.000 events.
  `src/cloud/restore-backup.test.ts`: xác thực/đồng bộ dưới Web Lock, hủy khi đổi account.
- `src/cloud/device-access.test.ts`, `src/pwa/register.test.ts`, `server/offline-shell.test.ts`:
  dấu nhớ local, logout nhiều tab, lifecycle đăng ký và worker chạy trong Node VM với Cache/Fetch giả.
  Những test này **không phải kiểm thử service worker trong trình duyệt thật**.
- React tests hiện là SSR markup/accessibility/escaping, **không phải browser E2E**.
- `npm run test:client -- src/ui/`: bổ sung theme/persistence fallback, journal filtering,
  scope theo bé, nhãn timer, cấu trúc dialog/navigation, sửa sau ACK và contract CSS/PWA. Kiểm tra các
  cặp token chữ/nền ở 4.5:1 và focus ở 3:1; không thay thế đo toàn bộ giao diện đã render.
- Checklist trực quan cần chạy trên trình duyệt/iPhone: bốn màn hình và mọi sheet ở
  cả hai theme; Tab/Shift+Tab/Escape và trả focus; 320/390/640px, màn hình ngang,
  zoom 200%, bàn phím ảo, tên/ghi chú dài, lỗi/disabled/autofill, theme sau reload.
- `npm test`: chạy cả legacy + client; `npm run test:legacy` chạy riêng 56 test wireframe/static.
- `npm run test:db`: PostgreSQL runtime suite trong container tạm, không kết nối remote DB;
  gồm quyền đổi tên owner/caregiver/revoked/anon, chống sửa chéo gia đình, retry/xung đột và giữ nguyên nhật ký.
- `npm run build`: typecheck + bundle; không thay thế các kiểm thử runtime ở trên.
- Sau build, `node scripts/check-offline-build.mjs` phục vụ artifact qua HTTP loopback rồi chạy
  worker trong Node VM: kiểm tra toàn bộ file được cache, offline HTML/lazy JS/CSS/icons,
  bỏ qua Auth/RPC và header cache trong cấu hình Vercel. Không dùng tài khoản/backend thật.
  `node scripts/check-client-bundle.mjs` kiểm tra marker server-secret/token không lọt vào bundle.

### Hồi quy UI trên Chromium với API giả

- Kịch bản: `tests/browser/ui-review.playwright.js`, callback cho Playwright MCP
  `browser_run_code_unsafe` (không phải file test tự chạy bằng Node).
- Dùng terminal PowerShell riêng: đặt `$env:VITE_SUPABASE_URL='https://ui-review.supabase.co'`,
  rồi chạy `npm run dev -- --port 5174 --strictPort`. Không cần key/cookie/tài khoản thật.
- Chạy callback bằng tham số `filename` trong thư mục MCP được phép đọc; nếu workspace
  nằm ngoài allowed roots, truyền trực tiếp nội dung callback qua tham số `code`.
  Callback tạo browser context riêng và đóng sau khi chạy, không dùng phiên đăng nhập sẵn có.
- Kịch bản chặn request ngoài localhost, giả lập toàn bộ Auth/RPC và tạo DB theo user
  ngẫu nhiên có tiền tố `ui-review-`; React, dialog, focus và IndexedDB chạy thật.
- Lần chạy 2026-09-05 đạt 303 kiểm tra: 40 tổ hợp màn hình/theme/viewport, 72 tổ hợp sheet,
  8 tổ hợp thông báo Hoàn tác; không có lỗi runtime hoặc request ra backend thật.
  Bao phủ backdrop/trả focus, thu gọn và nhớ lựa chọn, icon đồng bộ, đổi tên gia đình/bé,
  công tắc theme bằng chuột/bàn phím; ghi bù ngủ qua đêm và bỏ trống giờ thức để chạy timer.
  Các kiểm tra hồi quy khác gồm
  Tab/Shift+Tab/Escape, lưu lượng lẻ → sửa ghi chú → xóa → hoàn tác, lỗi form,
  tên 80 ký tự, font 200%, lưu theme sau reload. Kích thước 320–1280px và màn hình ngang.
- Cố ý trả HTTP 503 cho form tạo bé để kiểm tra lỗi; đó không phải backend hỏng.
  Không thay thế kiểm thử Safari/iPhone, bàn phím ảo, autofill thật, OAuth hoặc sync thật.

Sau cấu hình project ở [setup](setup.md), ưu tiên test hai tài khoản độc lập, hai thiết bị,
offline/reconnect/expired session, tải/nhập tệp sao lưu và xung đột; sau đó hoàn thiện UI còn thiếu.