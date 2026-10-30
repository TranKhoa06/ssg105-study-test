# SSG105 · Cùng học trong nhóm riêng

[Mở giao diện trên GitHub Pages](https://trankhoa06.github.io/ssg105-study-test/).

Trạng thái: giao diện đã được đưa lên GitHub, đã tách khỏi toàn bộ ảnh và câu hỏi SSG; chưa kết nối Supabase thật.

Giao diện ôn tập tương tác dành cho thành viên của nhóm. Nội dung câu hỏi và ảnh SSG lưu trong dịch vụ riêng tư, chỉ tải sau khi xác thực và kiểm tra thành viên được duyệt.

- Luyện từng câu, chọn đáp án và xem lời giải.
- Làm bài 10/20/50 câu hoặc toàn bộ câu đủ đáp án; nộp bài mới hiện kết quả.
- Ôn câu sai, đánh dấu, tìm kiếm và trộn thứ tự câu.
- Xem ảnh đề và ảnh đáp án gốc để đối chiếu.
- Giữ phiên đang làm, thống kê lần đầu và lần gần nhất; xuất/nhập tiến trình JSON.
- Có bố cục cho máy tính và điện thoại; hai môn tiếp theo chờ bổ sung tài liệu.

## Giới hạn bản thử

Repository công khai chỉ chứa giao diện, schema và kiểm tra. **Không có ảnh, bộ câu hỏi hoặc bản sao tiến trình cá nhân trong public files.** Dữ liệu SSG tại `private-data/` chỉ nằm trên máy chủ dự án và bị loại khỏi Git. Ảnh khi triển khai phải nằm trong bucket Supabase riêng tư, truy cập qua xác thực.

Mã đã chuẩn bị Google OAuth, kiểm tra thành viên, tải tài liệu riêng tư và lưu tiến trình online theo user ID. **Chưa kết nối dự án Supabase hoặc kiểm tra Google OAuth/Storage HTTP thật.** Khi chưa cấu hình, trang hiển thị trạng thái chuẩn bị; nút đăng nhập chưa hoạt động.

Bộ nguồn riêng có 130 câu, 129 câu chấm được theo đáp án ảnh. Câu thiếu đáp án vẫn giữ trạng thái chưa chấm. Nội dung từ OCR và đáp án nguồn chưa được kiểm chứng độc lập về kiến thức.

## Mã nguồn và xuất bản

Phần frontend nằm trong `docs/`. GitHub Pages lấy nhánh `main`, thư mục `/docs`. Supabase SDK đã được đóng gói kèm giấy phép; không cần tải thư viện từ CDN khi mở web.

Các bước cấu hình thật:

1. Kết nối dự án Supabase thuộc chủ nhóm; chạy `backend/schema.sql` sau khi kiểm tra các chính sách Storage hiện hữu.
2. Bật Google OAuth với đúng Client ID/Secret và URL callback/redirect của website. Không đưa secret Google vào mã frontend.
3. Sau khi tài khoản chủ nhóm đăng nhập, cấp `role='admin',status='active'` cho đúng `ssg_members.user_id`. Thành viên mới mặc định chờ duyệt; người học không thể tự sửa quyền.
4. Nhập câu hỏi vào `ssg_questions` và ảnh vào bucket **riêng tư** `ssg105-private`. `tools/make-private-seed.mjs` tạo SQL chứa tài liệu tại `private-data/seed.sql`, không đưa tệp này lên GitHub.
5. Điền URL dự án và publishable/anon key vào `docs/config.mjs`. Không dùng secret/service-role key trong frontend.
6. Kiểm tra đăng nhập thật, chặn người chưa được duyệt, quyền đọc ảnh và tiến trình riêng qua hai tài khoản/hai thiết bị.

Kiểm tra cấu trúc public files và logic:

```sh
node --test tests/privacy.test.mjs tests/study.test.mjs
```

Các kiểm tra cần ảnh/câu hỏi tự bỏ qua khi `private-data/` không tồn tại trên checkout công khai. `tests/access.test.mjs` kiểm tra quyền bằng PGlite; cài `@electric-sql/pglite` hoặc gán `SSG_TEST_DEPENDENCIES` đến package.json đã có thư viện để chạy. SQL/RLS đã chạy kiểm thử cục bộ, không thay thế xác minh dịch vụ Supabase thật.

Không đưa secret, tài khoản người học hoặc bản sao tiến trình cá nhân vào kho này. Phần câu hỏi/ảnh không bao giờ được sao chép ngược vào `docs/` để né bước đăng nhập.
