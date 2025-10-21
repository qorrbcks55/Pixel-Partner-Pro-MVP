// js/cursor.js

// 1) 링 커서 요소 생성
const cursor = document.createElement('div');
cursor.className = 'cursor';
document.body.appendChild(cursor);

// 2) 캔버스 설정
const canvas = document.getElementById('trail-canvas');
const ctx    = canvas.getContext('2d');
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// 3) 꼬리 세그먼트 수 & 초기화
const SEGMENTS     = 11;
const FOLLOW_SPEED = 0.40;
const segments     = Array.from({ length: SEGMENTS }, () => ({ x: 0, y: 0 }));

// 4) 마우스 좌표 추적
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// 5) 애니메이션 루프
function draw() {
  // 캔버스 초기화
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 첫 세그먼트가 포인터를 따라오게
  segments[0].x += (mouseX - segments[0].x) * FOLLOW_SPEED;
  segments[0].y += (mouseY - segments[0].y) * FOLLOW_SPEED;

  // 나머지 세그먼트는 앞 세그먼트를 따라가게
  for (let i = 1; i < SEGMENTS; i++) {
    segments[i].x += (segments[i-1].x - segments[i].x) * FOLLOW_SPEED;
    segments[i].y += (segments[i-1].y - segments[i].y) * FOLLOW_SPEED;
  }

  // 부드러운 곡선으로 꼬리 그리기
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.lineWidth   = 7;
  ctx.strokeStyle = 'rgba(20, 42, 171, 0.9)';  // RGBA(불투명도 조절 가능)
  ctx.beginPath();
  ctx.moveTo(segments[0].x, segments[0].y);
  for (let i = 1; i < SEGMENTS - 1; i++) {
    const cx = (segments[i].x + segments[i+1].x) / 2;
    const cy = (segments[i].y + segments[i+1].y) / 2;
    ctx.quadraticCurveTo(segments[i].x, segments[i].y, cx, cy);
  }
  ctx.lineTo(segments[SEGMENTS-1].x, segments[SEGMENTS-1].y);
  ctx.stroke();

  // 6) 링 커서 위치 업데이트 (중앙 기준)
  //    CSS에서 .cursor에 transform(-50%, -50%) 추가된 상태
  //    따라서 단순히 좌표를 그대로 사용하면 중심이 정확히 맞음
  cursor.style.left = mouseX + 'px';
  cursor.style.top  = mouseY + 'px';

  requestAnimationFrame(draw);
}
draw();
