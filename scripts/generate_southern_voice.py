"""Tạo bộ thoại TinyExplorers với giọng nữ miền Nam Thục Đoan.

Script này chỉ dùng khi chuẩn bị tài nguyên. Website không tải hoặc gọi TTS lúc chơi.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from pathlib import Path

from gradio_client import Client, handle_file
from huggingface_hub import hf_hub_download


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "audio-southern"
SPACE = "Tuananh20015/VieNeu-TTS-v3-Turbo"
VOICE = "Ngọc Linh"  # Bị bỏ qua khi có audio tham chiếu.
REFERENCE_NAME = "sample/Đoan (nữ miền Nam).wav"

ANIMALS = [
    "Gâu gâu!", "Meo meo!", "Cạp cạp!", "Ò ò!",
    "Tu tu!", "Ò ó o!", "Be be!", "Ộp ộp!",
]
SHAPES = ["hình tròn", "hình vuông", "hình tam giác", "hình ngôi sao"]
COLORS = ["đỏ", "vàng", "xanh dương", "xanh lá"]
EMOTIONS = ["vui", "buồn", "ngạc nhiên", "tức giận"]


def phrases() -> list[str]:
    values = {
        "Chào mừng bé đến với khu vườn khám phá!",
        "Đúng rồi! Bé giỏi quá!",
        "Ting! Khéo tay quá!",
        "Thử lại lần nữa nào!",
        "Gần đúng rồi. Bé thử ghép lại nhé!",
        "Bạn này cũng đáng yêu quá. Bé nghe lại nhé!",
        "Ồ, màu này cũng đẹp. Bé thử lại nhé!",
    }
    values.update(f"{sound} Bé tìm xem tiếng của bạn nào nhé!" for sound in ANIMALS)
    values.update(f"Bé kéo {shape} vào chiếc hộp giống nó nhé!" for shape in SHAPES)
    values.update(f"Bé hãy chọn màu {color} nhé!" for color in COLORS)
    values.update(f"Bạn nhỏ đang rất {emotion}. Bé ghép khuôn mặt cho bạn nào!" for emotion in EMOTIONS)
    return sorted(values)


def voice_key(text: str) -> str:
    value = 2166136261
    for character in text:
        value = ((value ^ ord(character)) * 16777619) & 0xFFFFFFFF
    return f"{value:08x}"


def generate(client: Client, reference: Path, text: str, output: Path) -> None:
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            result = client.predict(
                text=text,
                voice=VOICE,
                ref_audio=handle_file(reference),
                temperature=0.72,
                top_k=25,
                top_p=0.9,
                repetition_penalty=1.2,
                max_new_frames=300,
                max_chars=256,
                api_name="/synthesize",
            )
            source = Path(result[0] if isinstance(result, (tuple, list)) else result)
            if not source.exists() or source.stat().st_size < 1_000:
                raise RuntimeError(f"TTS không trả tệp hợp lệ cho câu: {text}")
            shutil.copyfile(source, output)
            return
        except Exception as error:
            last_error = error
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Không thể tạo câu sau 4 lần thử: {text}") from last_error


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", action="store_true", help="Chỉ tạo một câu để kiểm tra")
    args = parser.parse_args()

    OUTPUT.mkdir(parents=True, exist_ok=True)
    items = phrases()
    if args.sample:
        items = [next(
            (text for text in items if not (OUTPUT / f"{voice_key(text)}.wav").exists()),
            items[0],
        )]
    reference = Path(hf_hub_download(
        repo_id="Vinasoy3015/VieNeu-TTS",
        filename=REFERENCE_NAME,
        repo_type="space",
    ))
    client = Client(SPACE, verbose=False)
    for index, text in enumerate(items, 1):
        target = OUTPUT / f"{voice_key(text)}.wav"
        if target.exists() and target.stat().st_size > 1_000:
            print(f"[{index:02d}/{len(items)}] đã có {target.name}", flush=True)
            continue
        generate(client, reference, text, target)
        print(f"[{index:02d}/{len(items)}] {target.name} — {text}", flush=True)


if __name__ == "__main__":
    main()
