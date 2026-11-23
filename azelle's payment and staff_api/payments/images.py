from io import BytesIO
import warnings
from PIL import Image, ImageOps, UnidentifiedImageError
from django.core.exceptions import ValidationError

MAX_BYTES = 5 * 1024 * 1024


def clean_image(upload):
    if not upload or upload.size > MAX_BYTES:
        raise ValidationError("Upload a PNG or JPEG image up to 5 MB.")
    raw = upload.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValidationError("Image is too large.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as image:
                if image.format not in {"PNG", "JPEG"} or image.width * image.height > 16_000_000:
                    raise ValidationError("Use a PNG or JPEG image up to 16 megapixels.")
                image.load()
                # Decode and re-encode: strip metadata, scripts and trailing file content.
                cleaned = ImageOps.exif_transpose(image).convert("RGB")
                output = BytesIO()
                cleaned.save(output, format="PNG")
                data = output.getvalue()
                if len(data) > MAX_BYTES:
                    raise ValidationError("Processed image exceeds 5 MB. Use a smaller image.")
                return data
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValidationError("This file is not a valid PNG or JPEG image.") from None
