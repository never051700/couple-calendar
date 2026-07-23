// URL을 Android/iOS에서 스캔할 수 있는 QR PNG로 생성
// 사용: node scripts/gen-qr.mjs "exp://..." [출력 경로]
import QRCode from 'qrcode';
import path from 'path';

const url = process.argv[2];
if (!url) {
  console.error('URL 인자가 필요합니다.');
  process.exit(1);
}

const out = path.resolve(process.argv[3] ?? 'expo-qr.png');

await QRCode.toFile(out, url, {
  width: 600,
  margin: 2,
  color: { dark: '#000000', light: '#FFFFFF' },
});

console.log('QR 생성 완료:', out);
console.log('대상 URL:', url);
