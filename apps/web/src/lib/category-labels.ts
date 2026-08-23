/**
 * Category names live in the database and belong to ADM-003 (Dev 2's module),
 * where they are seeded in English. Until a Thai name is stored alongside them,
 * the storefront translates the known ones here.
 *
 * Keyed by `slug` rather than `name` because the slug is the stable identifier
 * — `electronics` is currently seeded with the name "WRONG-NAME", which is
 * exactly the kind of drift a name-keyed map would miss.
 *
 * Anything unmapped falls back to whatever the API returned, so a category an
 * admin adds later shows up in English rather than disappearing.
 */
const CATEGORY_LABELS_TH: Record<string, string> = {
  "beauty-care": "ความงามและของใช้ส่วนตัว",
  fragrance: "น้ำหอม",
  skincare: "ผลิตภัณฑ์ดูแลผิว",
  "books-stationery": "หนังสือและเครื่องเขียน",
  notebooks: "สมุดโน้ต",
  collectibles: "ของสะสม",
  fashion: "แฟชั่น",
  "home-living": "บ้านและการอยู่อาศัย",
  furniture: "เฟอร์นิเจอร์",
  kitchenware: "เครื่องครัว",
  "sports-outdoor": "กีฬาและกิจกรรมกลางแจ้ง",
  camping: "แคมป์ปิ้ง",
  cycling: "จักรยาน",
  electronics: "เครื่องใช้ไฟฟ้าและอิเล็กทรอนิกส์",
}

export function categoryLabel(category: {
  slug: string
  name: string
}): string {
  return CATEGORY_LABELS_TH[category.slug] ?? category.name
}
