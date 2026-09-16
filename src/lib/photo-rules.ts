/**
 * Правила загрузки фотографий объектов — одни и те же в браузере (подсказка
 * и проверка до отправки) и на сервере (защита от обхода формы). Держим их в
 * одном месте, чтобы лимит на экране и лимит в API не разъезжались.
 *
 * Лимит 20 МБ выбран по реальным фото с телефонов: кадр 4032×3024 в JPEG —
 * это 4–10 МБ, а у Caddy на входе стоит max_size 50MB (Caddyfile), поэтому
 * файл сверх лимита пользователь видит понятной ошибкой формы, а не
 * пустым ответом 413 от прокси.
 */
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Расширения — на случай, когда браузер не прислал MIME-тип файла */
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const

/** Человекочитаемый список форматов для подсказок и ошибок */
export const PHOTO_FORMATS_LABEL = 'JPG, PNG или WEBP'

export const PHOTO_MAX_BYTES = 20 * 1024 * 1024

export const PHOTO_MAX_LABEL = '20 МБ'

/** Размер файла в мегабайтах для сообщений об ошибке: 3,4 МБ */
export function photoSizeLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`
}

/** Расширение файла в нижнем регистре, без точки ('' — если его нет) */
export function photoExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}

/**
 * Фото ли это разрешённого формата. Проверяем и MIME-тип, и расширение:
 * часть браузеров (и почти все — на iPhone) отдаёт file.type пустым, а
 * HEIC/AVIF с камеры телефона под запрет попадать не должен.
 */
export function isAllowedPhoto(file: { name: string; type?: string }): boolean {
  const type = (file.type || '').toLowerCase()
  if ((PHOTO_MIME_TYPES as readonly string[]).includes(type)) return true
  if (!type) return (PHOTO_EXTENSIONS as readonly string[]).includes(photoExtension(file.name))
  return false
}
