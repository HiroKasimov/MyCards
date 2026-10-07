# MyCards — Neon Card Hub

## Ochish

`index.html` ni yuklab olib Chrome, Edge yoki Firefox bilan oching. Boshqa fayl, internet yoki server dizayn va mahalliy vault uchun kerak emas: CSS, JavaScript va neon fon shu fayl ichida.

Birinchi ochilishda DEMO rejim ishlaydi. Kartalar namuna. Demo rejimda qo‘shilgan kartalar vaqtincha turadi; o‘chirilgan namuna kartalari esa shu brauzerda qayta chiqmaydi. Shaxsiy kartalar uchun pastdagi “Shaxsiy vault yaratish / ochish” tugmasini bosing. Parol yarating va karta qo‘shing. Parol unutilsa ma’lumotlar tiklanmaydi.

Bitta hub: chapdagi UzCard, Humo va Visa bir xil kontent maydonini almashtiradi. Har bir bo‘limda faqat shu turdagi kartalar ko‘rinadi. Telefonda pastki nav ishlaydi; kartalarni yon tomonga surish mumkin.

Kartani bosganda raqam va muddat 10 soniyaga ochiladi. Nusxalash, tahrirlash va o‘chirish karta menyusida. Sozlamalarda shifrlangan backup yuklab olinadi. CVV/PIN saqlanmaydi.

## Fayllar

- `index.html`: mustaqil, to‘liq tayyor versiya. O‘zi yetarli.
- `source.html`, `styles.css`, `app.js`, `firebase-config.js`: alohida manba fayllari bilan ishlamoqchi bo‘lganlar uchun. Bu ko‘rinishga mahalliy HTTP server kerak (`python3 -m http.server 8080`), so‘ng `http://localhost:8080/source.html` ni oching.

## Firebase

Mustaqil `index.html` ichida `window.MYCARDS_FIREBASE` ni qidiring, config qiymatlarini kiriting va `enabled: true` qiling. Alohida manba versiyasi uchun xuddi shu o‘zgarish `firebase-config.js` da qilinadi.

Google login va Firestore internet, HTTPS (yoki localhost), Firebase loyiha sozlamalari va Google provider yoqilishini talab qiladi. `file://` orqali mahalliy dizayn/vault ishlaydi; cloud login uchun GitHub Pages yoki localhost orqali oching.

Firestore qoidalari:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/data/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Firestore’ga raqamlarning ochiq listi emas, AES-GCM bilan shifrlangan vault yoziladi. PBKDF2 SHA-256, 250000 iteratsiya. Firebase integratsiyasi haqiqiy loyiha konfiguratsiyasiz tekshirilmagan.

## GitHub Pages

`index.html` ni repo ildiziga joylang, Settings → Pages orqali branch/root tanlang. Standalone index uchun boshqa manba fayllarini qo‘shish shart emas.

## Tekshiruv

Chrome’da mustaqil `file://` ochish, dizayn yuklanishi, uch tur tablarning ajratilishi, qidiruv, 10 soniyada yashirish, bo‘sh formani bekor qilish, karta qo‘shish, shifrlangan localStorage, qayta ochishda parol orqali tiklash, 390px mobil o‘lchamda overflow yo‘qligi tekshirildi.

## Bugfix — 2026-10-07

Demo kartalarni menyu yoki pastdagi O‘chirish tugmasi bilan o‘chirish mumkin. O‘chirilgan namunalarning faqat ID lari eslab qolinadi; karta raqamlari demo xotiraga yozilmaydi.

Karta oynasidagi X va Bekor qilish bo‘sh maydonlarda ham ishlaydi. Saqlash tugmasi ma’lumot yetishmasa oynaning ichida aniq xato ko‘rsatadi; to‘g‘ri to‘ldirilgan karta saqlanib, oyna yopiladi. Preview ichida bloklanadigan brauzer confirm va native form submit o‘rniga bevosita tugma ishlovchilari va ilova ichidagi o‘chirish tasdig‘i ishlatiladi.

Bu oqimlar form submit va brauzer confirm bloklangan iframe ichida ham tekshirildi.

## Har bir karta uchun alohida dizayn

Sozlamalar → Karta dizaynlari → Dizaynni sozlash. Karta burchagidagi ⋮ → Dizayn orqali ham ochiladi.

Neon yaltirash, Aurora, Ranglar oqimi, Neon puls yoki Yaltirashsiz ko‘rinish tanlanadi. Animatsiya davri va yuklangan fon qorayishi o‘zgartiriladi. Preview orqali natija darhol ko‘rinadi; Saqlash faqat tanlangan kartaga qo‘llaydi. Bekor qilish o‘zgarishlarni tashlaydi.

PNG, JPG, WebP, animatsiyali GIF, WebM va MP4 yuklash mumkin. Bir fayl 300 KB gacha; barcha yuklangan fonlar va karta ma’lumotlari uchun umumiy sig‘im cheklovi bor. Video ovozsiz loop bilan ishlaydi; format brauzerda o‘qilmasa aniq xato chiqadi.

Shaxsiy vaultda dizayn va yuklangan fon karta bilan birga AES-GCM orqali shifrlanadi va qayta ochishda tiklanadi. Demo rejimda dizaynlar vaqtincha. Kartani tahrirlash uning dizaynini saqlab qoladi.

Kartadagi yozuv va chip karta eni bilan moslashadi. Amal qilish muddati oddiy karta yuzasida ko‘rinmaydi; faqat karta ataylab ochilgandagi tafsilot oynasida chiqadi. Asosiy pastki Tafsilotlar / Nusxalash / O‘chirish tugmalari olib tashlandi; bu amallar ⋮ menyusida mavjud. Pastda faqat karta dizaynlariga o‘tish qolgan.
