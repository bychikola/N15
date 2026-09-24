import path from 'node:path'

/**
 * Путь к файлу в закрытом хранилище загрузок по имени из документа media.
 *
 * Имя файла формирует Payload при загрузке — он чистит и имя, и путь, — но
 * проверяем ещё раз здесь. Причина: эти функции читают файл по данным, которые
 * когда-то принёс посетитель (фото из заявки на рекламу, фото объявления
 * доски), а имя с «../» или разделителем пути увело бы чтение за пределы
 * папки. Второй барьер дешевле, чем разбираться с чтением произвольного файла
 * на сервере.
 *
 * Возвращает абсолютный путь или null, если имя выглядит подозрительно —
 * вызывающая сторона пропускает такой файл и пишет строку в лог.
 *
 * Папки лежат внутри тома media (docker-compose): staticDir у закрытых
 * коллекций задан как media/board-materials и media/ad-materials — своя папка
 * вне тома терялась бы при каждом обновлении контейнера.
 */
export function storedFilePath(folder: string, filename: string): string | null {
  if (!filename || filename.includes('..')) return null
  if (filename.includes('/') || filename.includes('\\')) return null
  const dir = path.resolve(process.cwd(), 'media', folder)
  const full = path.resolve(dir, filename)
  // Страховка на случай экзотики: путь обязан остаться внутри своей папки
  return full.startsWith(dir + path.sep) ? full : null
}
