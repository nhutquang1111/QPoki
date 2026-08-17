# TinyExplorers

Ứng dụng PWA trò chơi nhận biết và phản xạ dành cho trẻ từ 1,5–4 tuổi. Ứng dụng chạy hoàn toàn trên trình duyệt, không yêu cầu tài khoản, không có quảng cáo và không gửi dữ liệu của trẻ ra bên ngoài.

## Chạy trên máy

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm run dev
```

Mở địa chỉ do Vite hiển thị, thông thường là `http://localhost:5173`.

## Kiểm tra bản production

```bash
npm run lint
npm run build
npm run preview
```

Thư mục kết quả là `dist/`. Service worker chỉ hoạt động đầy đủ trong bản production qua HTTPS hoặc localhost.

## Triển khai Vercel

1. Tạo tài khoản Vercel và đưa mã nguồn lên một repository GitHub cá nhân.
2. Trong Vercel, chọn **Add New → Project** và import repository.
3. Vercel sẽ tự nhận dạng Vite. Cấu hình build đã có trong `vercel.json`.
4. Nhấn **Deploy**. Không cần biến môi trường, database hay dịch vụ bên ngoài.

## Dữ liệu và âm thanh

- Tiến độ và cài đặt được lưu trong `localStorage` của thiết bị.
- Hiệu ứng, nhạc nền được tạo bằng Web Audio API, không gọi máy chủ bên ngoài.
- Toàn bộ 27 câu hướng dẫn và phản hồi dùng tệp WAV giọng nữ miền Nam đóng gói cùng ứng dụng. Ứng dụng không dùng giọng đọc của trình duyệt và không gọi dịch vụ TTS khi trẻ chơi.
- Xóa dữ liệu trình duyệt cũng sẽ xóa tiến độ của bé.
