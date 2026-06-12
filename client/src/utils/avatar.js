const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file) return 'Файл не выбран';
  if (!ACCEPTED.includes(file.type)) return 'Поддерживаются JPG, PNG, GIF, WEBP';
  if (file.size > MAX_SIZE) return 'Файл слишком большой (макс. 2 МБ)';
  return null;
}

export function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    const err = validateImageFile(file);
    if (err) return reject(new Error(err));

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 500;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;

      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Не удалось обработать изображение'));
          resolve(new File([blob], 'avatar.webp', { type: 'image/webp' }));
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось загрузить изображение'));
    };

    img.src = url;
  });
}
