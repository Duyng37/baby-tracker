# ADR 002 — Phiên web → PWA bằng cookie và BFF

## Mục tiêu và giới hạn

- iOS 17.2+ có cơ chế sao chép cookie website khi **tạo mới** Home Screen web app,
  kể cả khi thêm từ Chrome; không sao chép localStorage/IndexedDB. Sau cài đặt không
  chia sẻ storage liên tục. [Nguồn WebKit](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).
- Luồng đích: đăng nhập web → thêm vào màn hình chính → mở nhật ký, không mở Google lần nữa.
- Đã triển khai và có kiểm thử tự động; **chưa nghiệm thu bằng iPhone/Chrome thật**.
  Cookie sao chép là hành vi của hệ điều hành, không phải khả năng app có thể ép buộc.
- PWA đã cài từ trước không tự nhận cookie vừa tạo ở Chrome. Không gỡ app/xóa storage
  nếu còn outbox chưa gửi. Cần đăng nhập trong bản cũ hoặc kiểm thử bằng cài đặt mới riêng.
- Phiên localStorage của bản frontend cũ cần đăng nhập lại **một lần khi nâng cấp** sang BFF.
  Bản mới không đọc/chuyển token cũ sang server, không xóa IndexedDB. Phiên Google hiện có
  trong Chrome thường giúp tránh nhập mật khẩu, nhưng quyết định xác thực thuộc Google.
- Manifest, PNG icons, iOS metadata và service worker cache giao diện đã có. Mở lại offline
  cần chuẩn bị trên chính PWA khi có mạng và chọn nhật ký local nếu chưa xác nhận phiên.
  Sync chờ xác thực lại; local user ID không phải credential. Hướng dẫn/giới hạn: [frontend](frontend.md).

## Icon màn hình chính

- Logo chữ **n** dùng chung hình vector cho màn hình đăng nhập, màn hình khởi động
  và PNG PWA; không phụ thuộc font cài trên thiết bị hoặc máy build.
- Android dùng PNG 192/512px trong manifest; iPhone dùng `apple-touch-icon` 180px.
  Các tệp `noi-v2-*.png` thay icon trăng khuyết cũ và được cache cùng phiên bản giao diện.
- Sau khi triển khai, mở app khi có mạng, đóng hết tab/PWA cũ rồi mở lại để nhận bản mới.
  Icon trên màn hình chính do hệ điều hành quản lý nên có thể chưa cập nhật ngay,
  đặc biệt với PWA đã cài trên iPhone; đổi URL ảnh không bảo đảm cập nhật icon đã cài.
- **Không gỡ PWA hoặc xóa dữ liệu trình duyệt chỉ để đổi icon** nếu còn ghi nhận chưa
  đồng bộ. Nếu cần cài lại để nhận icon mới, hãy đồng bộ và xuất bản sao lưu trước.

## Thiết kế

1. Browser POST `/api/auth?action=start` cùng origin, có header `X-Noi-Client: 1`.
2. Server tạo PKCE verifier trong cookie AES-256-GCM, HttpOnly, hạn 10 phút; chuyển
   qua Supabase → Google. Không ép `prompt=login`/`consent`; không iframe đăng nhập.
3. Supabase trả code về `/api/auth?action=callback`. Server kiểm tra cookie/verifier,
   exchange code, tạo phiên rồi redirect `303 /`; không trả token hay user profile về JS.
4. Cookie `__Host-noi_session`: ID ngẫu nhiên 256-bit, `Secure; HttpOnly; SameSite=Lax;
   Path=/`, không `Domain`. Database chỉ lưu SHA-256 của ID; token mã hóa riêng bằng
   khóa server và AAD gắn với ID hash. Không lưu provider token/email trong vault.
5. `/api/auth?action=session` chỉ trả user ID và project hostname. Frontend khôi phục
   phiên lúc mở app/foreground/online; lỗi mạng/503 không bị hiểu là đăng xuất.
6. Mọi RPC đi qua `/api/rpc`, allowlist 10 RPC nghiệp vụ. Server kiểm tra project và
   expected user **trước khi** gửi; gọi Supabase bằng JWT người dùng, không service-role.
   RLS, membership và idempotency SQL giữ nguyên. Service key chỉ dùng vault RPC.
7. Chrome/PWA có cookie sao chép trỏ tới cùng một phiên server. Lease 30 giây trong DB
   + compare-and-set ngăn refresh token race giữa Vercel instances. Worker cũ không ghi
   đè worker mới; request cạnh tranh nhận 503/retry, không bị xóa phiên.
8. Phiên có hạn tuyệt đối 30 ngày, không gia hạn vô hạn. Đăng xuất xóa vault row trước
   khi xóa cookie; các bản sao bị từ chối ngay ở request tiếp theo. Refresh đang chạy
   không thể hồi sinh row. Token Supabase không bị revoke bằng admin global sign-out;
   chúng không còn được BFF sử dụng/khôi phục sau khi row bị xóa.

### Ranh giới bảo mật

- Origin cố định từ cấu hình, không tin Host/X-Forwarded-Host. Mutation yêu cầu Origin
  chính xác + header tùy chỉnh; không bật CORS. Cookie Lax là lớp bổ sung, không thay CSRF.
- Callback ngoại lệ vì là top-level OAuth redirect, được ràng buộc bởi PKCE cookie.
- Auth/RPC: private/no-store ở browser/CDN; không cache cả lỗi. CSP chặn scripts ngoài,
  framing, object và API cross-origin. Không analytics trong luồng callback.
- Không ghi request/response/body/header/cookie/query vào log. OAuth code bắt buộc xuất
  hiện trên callback theo giao thức; tránh log query trong log drains/observability.
- Logout cần mạng. Bản sao đang offline chưa biết việc thu hồi; cache local không được
  mã hóa riêng. Có quyền truy cập thiết bị/profile là có thể đọc cache theo giới hạn cũ.
- Phiên Supabase bị thu hồi từ bên ngoài có thể còn JWT hợp lệ tới lúc hết hạn; BFF phát
  hiện khi refresh thất bại. Thu hồi qua logout BFF có hiệu lực cho request BFF tiếp theo.
- JS mới không nhận token, nhưng HttpOnly không ngăn XSS thực hiện hành động thay người
  dùng. Vẫn cần giữ CSP, escape nội dung và kiểm thử quyền server.

## Cấu hình Vercel — bắt buộc trước khi deploy bản này

Giữ preset Vite, build `npm run build`, output `dist`. Vercel tự tạo Node Functions từ
`api/auth.ts`, `api/rpc.ts`. Không đưa `server/` vào thư mục `public/` hoặc bundle frontend.

| Biến | Phạm vi | Giá trị |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Frontend công khai | URL project, giữ nguyên để không đổi namespace IndexedDB |
| `APP_ORIGIN` | Server | Origin HTTPS production cố định, không đường dẫn/query |
| `SUPABASE_URL` | Server | Cùng project với biến VITE ở trên |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Publishable key dạng `sb_publishable_` |
| `SUPABASE_SECRET_KEY` | **Server secret** | Secret key dạng `sb_secret_` từ Supabase API Keys; KHÔNG thêm VITE_ |
| `SESSION_ENCRYPTION_KEY` | **Server secret** | 32 byte ngẫu nhiên mật mã, mã hóa thành 64 ký tự hex |

Dùng password manager/công cụ tạo secret đáng tin, lưu trực tiếp vào Vercel và nơi
quản lý secret. Không dùng key mẫu, mật khẩu tự nghĩ, không gửi key/token qua chat/log.
Không thay khóa mã hóa giữa các deployment thông thường: sẽ làm phiên hiện có không
giải mã được. Luân chuyển khóa hiện cần kế hoạch buộc đăng nhập lại; chưa có keyring.
Biến `VITE_SUPABASE_PUBLISHABLE_KEY` cũ không còn được code đọc, có thể bỏ khỏi Vercel.
Không thêm secret cho môi trường Preview không đáng tin. Dùng project/cấu hình test
riêng cho preview; không wildcard mọi preview vào allowlist OAuth.

## Migration và callback

1. Xác nhận Supabase CLI đang link đúng Baby Tracker; không dùng reset hay project CRM.
2. Chạy `npx supabase migration list` và `npx supabase db push --dry-run`.
3. Nếu remote đã có 001–003, chỉ còn `202609050004_server_sessions.sql`. Nếu chưa có
   schema thì cả bốn phải xuất hiện theo thứ tự. Dừng nếu lịch sử remote bất thường.
4. Kiểm tra rồi tự chạy `npx supabase db push`; xác nhận Local/Remote khớp.
5. Supabase Authentication → URL Configuration: Site URL là origin app; Redirect URLs
   thêm **chính xác** URL app + `/api/auth?action=callback`. Với domain hiện dùng:
   `https://baby-tracker-sooty-theta.vercel.app/api/auth?action=callback`.
6. Giữ callback ở Google Cloud là URL Supabase `/auth/v1/callback`, không đổi sang Vercel.
7. Redeploy sau cấu hình env. Migration không tự chạy khi deploy. Không chạy SQL fixture
   test lên production. Migration mới chỉ thêm vault/functions, không đổi/xóa nhật ký.

Có thể giữ redirect `/` cũ trong đợt chuyển tiếp; code cũ và code BFF không chia sẻ
phiên với nhau. Không rollback sang frontend cũ mà kỳ vọng nó đọc được cookie HttpOnly.
Các phiên hết hạn bị từ chối nhưng row còn trong vault: cần lịch dọn expired rows được
quản trị phê duyệt trước khi tăng quy mô; chưa bật cron/garbage collection tự động.

## Local

- Copy `.env.example` sang `.env.local`, nhập riêng tư. Vite dev middleware chạy cùng
  BFF tại `http://127.0.0.1:5173`; server env không được inject vào browser.
- Supabase allowlist thêm `http://127.0.0.1:5173/api/auth?action=callback` cho local.
  Cookie local không có Secure/__Host- chỉ khi origin là localhost/127.0.0.1 và không
  phải production. Không dùng ngoại lệ này trên LAN/HTTP public.
- `npm run preview` chỉ phục vụ bundle tĩnh, **không phải** môi trường test BFF.
- Không có dependency mới, không cần SSR framework/Workbox để quản lý phiên cookie.

## Checklist nghiệm thu (dữ liệu giả)

- [ ] Chrome iPhone/iOS 17.2+: đăng nhập → thấy nhật ký → thêm **PWA mới** → mở không qua Google.
- [ ] Mở/đóng PWA nhiều lần; web và PWA dùng song song tới khi access token cần refresh.
- [ ] Bắt đầu OAuth từ chính PWA: callback ở đúng ngữ cảnh; không vòng lặp sang Chrome/Safari.
- [ ] Logout web/PWA: bản còn lại bị ngắt ở request tiếp theo; outbox không bị xóa.
- [ ] Hai tài khoản/hai gia đình: outbox A không gửi bằng quyền B, không nhìn thấy dữ liệu nhau.
- [ ] Ghi offline khi app đang mở, khôi phục mạng; ACK đúng, không ghi trùng.
- [ ] Mất mạng/503 lúc refresh: không hiện đăng xuất giả. Cold start sau khi đã cache → chủ động mở
  nhật ký local → ghi/xuất backup → reconnect → xác thực lại → ACK, không mất/trùng ghi nhận.
- [ ] Tải/nhập backup trên iPhone/Android: đúng account/project, không ghi đè; kiểm tra tệp lớn và hết quota.
- [ ] Kiểm tra API/redirect/migration trên Vercel thật; không gửi cookie/headers/token trong ảnh chụp.

Kiểm thử tự động: `npm test`, `npm run test:db`, `npm run build`. Có test HTTP loopback,
CSRF, PKCE, cookie, AES-GCM, refresh cạnh tranh, logout-in-flight, account binding,
session lifecycle và SQL ACL/lease; không thay thế GoTrue/PostgREST/iPhone E2E thực.
Sau build chạy `node scripts/check-client-bundle.mjs` để kiểm tra marker secret/token/server
không lọt vào bundle frontend; script không đọc env hoặc in giá trị khớp.