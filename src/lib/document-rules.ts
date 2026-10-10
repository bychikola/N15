/**
 * Правила загрузки PDF-документов ЖК (презентация и планировки, коллекция
 * complex-documents) — одни и те же в браузере и на сервере: клиент решает,
 * куда слать файл, сервер окончательно проверяет формат.
 *
 * Формат определяем по «магии» содержимого, а не по MIME-типу от браузера:
 * iPhone Safari из «Файлов», Android Chrome при выборе из облака и часть
 * настольных браузеров отдают выбранный PDF с пустым type или как
 * application/octet-stream, а иногда и без расширения в имени. Заголовок
 * «%PDF-» есть у любого PDF и расширением не подделывается, поэтому проверка
 * по нему работает одинаково на всех устройствах, а не только на iPhone.
 */
export const PDF_MIME = 'application/pdf'

/** Первые байты любого PDF: заголовок «%PDF-» */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]

/**
 * Настоящий ли это PDF по началу файла. Принимает и Buffer (сервер), и
 * Uint8Array (браузер): Buffer — подкласс Uint8Array, поэтому одна проверка
 * годится обеим средам.
 */
export function hasPdfMagic(head: Uint8Array): boolean {
  if (head.length < PDF_MAGIC.length) return false
  return PDF_MAGIC.every((byte, index) => head[index] === byte)
}
