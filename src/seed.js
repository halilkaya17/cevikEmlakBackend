require("dotenv").config();

const bcrypt = require("bcryptjs");
const { connectDatabase } = require("./config/db");
const AdminUser = require("./models/AdminUser");
const Agent = require("./models/Agent");
const BlogPost = require("./models/BlogPost");
const Category = require("./models/Category");
const Listing = require("./models/Listing");
const PageContent = require("./models/PageContent");
const { BLOG_PAGE_TEMPLATE } = require("./utils/blogPage");

const iconLibrary = {
  apartment:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M5 21V4.8C5 3.8 5.8 3 6.8 3h10.4c1 0 1.8.8 1.8 1.8V21" stroke="currentColor" stroke-width="1.8"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M3 21h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  shop:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M4 10h16l-1.2-5.2A1 1 0 0 0 17.8 4H6.2a1 1 0 0 0-1 .8L4 10Z" stroke="currentColor" stroke-width="1.8"/><path d="M6 10v10h12V10M9 20v-5h6v5" stroke="currentColor" stroke-width="1.8"/></svg>',
  land:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M3 18 8 6l6 12 3-7 4 7H3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 6h8M16 6v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  project:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20V6.8C4 5.81 4.81 5 5.8 5h12.4C19.19 5 20 5.81 20 6.8V20" stroke="currentColor" stroke-width="1.8"/><path d="M8 9h2M14 9h2M8 13h2M14 13h2M8 17h8M2 20h20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

function slug(value) {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function options(items) {
  return items.map((label) => ({ label, value: slug(label) }));
}

function textField(key, label, type = "text", unit = "") {
  return { key, label, type, unit, showOnCard: ["oda_sayisi", "net_m2", "arazi_m2"].includes(key) };
}

function checkboxField(key, label, items) {
  return { key, label, type: "multiselect", options: options(items) };
}

function selectField(key, label, items) {
  return { key, label, type: "select", options: options(items) };
}

const konutIsyeriTemel = [
  textField("brut_m2", "Brüt m²", "number", "m²"),
  textField("net_m2", "Net m²", "number", "m²"),
  textField("oda_sayisi", "Oda Sayısı"),
  textField("salon_sayisi", "Salon Sayısı"),
  textField("banyo_sayisi", "Banyo Sayısı"),
  textField("bulundugu_kat", "Bulunduğu Kat"),
  textField("kat_sayisi", "Kat Sayısı", "number"),
  textField("aidat", "Aidat", "number", "TL"),
  textField("bina_yasi", "Bina Yaşı"),
  textField("kullanim_durumu", "Kullanım Durumu"),
  textField("tapu_durumu", "Tapu Durumu"),
  textField("cephe", "Cephe"),
];

const arsaTemel = [
  selectField("imar_durumu", "İmar Durumu", ["Konut İmarlı", "Ticari İmarlı", "Ticari+Konut", "Zeytinlik", "Tarla", "Lojistik", "İmarsız"]),
  textField("arazi_m2", "Arazi M²", "number", "m²"),
  textField("m2_fiyati", "M² Fiyatı", "number", "TL"),
  textField("ada_no", "Ada No"),
  textField("parsel_no", "Parsel No"),
  textField("pafta_no", "Pafta No"),
  textField("tapu_durumu", "Tapu Durumu"),
];

const commonGroups = [
  {
    name: "İç Özellikler",
    key: "ic-ozellikler",
    fields: [
      checkboxField("ic_ozellikler", "İç Özellikler", [
        "ADSL",
        "Ahşap Doğrama",
        "Akıllı Ev",
        "Alarm (Hırsız)",
        "Alarm (Yangın)",
        "Alaturka Tuvalet",
        "Alüminyum Doğrama",
        "Amerikan Kapı",
        "Ankastre Fırın",
        "Barbekü",
        "Beyaz Eşya",
        "Boyalı",
        "Bulaşık Makinesi",
        "Buzdolabı",
        "Çamaşır Kurutma Makinesi",
        "Çamaşır Makinesi",
        "Çamaşır Odası",
        "Çelik Kapı",
        "Duşakabin",
        "Duvar Kağıdı",
        "Ebeveyn Banyosu",
        "Fırın",
        "Fiber İnternet",
        "Giyinme Odası",
        "Gömme Dolap",
        "Görüntülü Diyafon",
        "Hilton Banyo",
        "Intercom Sistemi",
        "Isıcam",
        "Jakuzi",
        "Kartonpiyer",
        "Kiler",
        "Klima",
        "Küvet",
        "Laminat Zemin",
        "Marley",
        "Mobilya",
        "Mutfak (Ankastre)",
        "Mutfak (Laminat)",
        "Mutfak Doğalgazlı",
        "Panjur/Jaluzi",
        "Elektrikli Panjur",
        "Parke Zemin",
        "PVC Doğrama",
        "Seramik Zemin",
        "Set Üstü Ocak",
        "Spot Aydınlatma",
        "Şofben",
        "Şömine",
        "Teras",
        "Termosifon",
        "Vestiyer",
      ]),
    ],
  },
  {
    name: "Dış Özellikler",
    key: "dis-ozellikler",
    fields: [
      checkboxField("dis_ozellikler", "Dış Özellikler", [
        "Kapalı Otopark",
        "Açık Otopark",
        "Asansör",
        "Jeneratör",
        "Su Deposu & Hidrofor",
        "Depo",
        "Isı İzolasyonu",
        "Ses İzolasyonu",
        "Profesyonel Yönetim",
        "7/24 Teknik Servis",
        "Hırsız Alarmı",
        "Yangın Alarmı",
        "Güvenlik Kamerası",
        "Araç Şarj İstasyonu",
        "7/24 Güvenlik",
        "Yük Asansörü",
        "Apartman Görevlisi",
        "Yangın Merdiveni",
        "Site Özellikli",
        "Basketbol Sahası",
        "Açık/Yüzme Havuzu",
        "Voleybol Sahası",
        "Çocuk Oyun Alanı",
        "Spor Alanı",
        "Sauna",
        "Yürüyüş Parkuru",
        "Kameryiye",
        "Sosyal Tesisler",
        "Tenis Kort",
      ]),
    ],
  },
  {
    name: "Manzara",
    key: "manzara",
    fields: [
      checkboxField("manzara", "Manzara", [
        "Deniz",
        "Havuz",
        "Göl",
        "Şehir",
        "Boğaz",
        "Site İçi",
        "Park/Yeşil Alan",
        "Bahçe",
        "Kapanmaz Deniz Manzaralı",
        "Kısmi Deniz Manzaralı",
      ]),
    ],
  },
  {
    name: "Engelli / Yaşlı",
    key: "engelli-yasli",
    fields: [
      checkboxField("engelli_yasli", "Engelli / Yaşlı", [
        "Araç Park Yeri",
        "Engelliye Uygun Asansör",
        "Engelliye Uygun Banyo",
        "Engelliye Uygun Mutfak",
        "Engelliye Uygun Park",
        "Geniş Koridor",
        "Giriş / Rampa",
        "Merdiven",
        "Oda Kapısı",
        "Priz / Elektrik Anahtarı",
        "Tutamak / Korkuluk",
        "Tuvalet",
        "Açık Yüzme Havuzu",
        "Kapalı Yüzme Havuzu",
      ]),
    ],
  },
];

const konutGroups = [
  { name: "Temel Özellikler", key: "temel-ozellikler", fields: konutIsyeriTemel },
  {
    name: "Konut Tipi",
    key: "konut-tipi",
    fields: [
      selectField("konut_tipi", "Konut Tipi", [
        "Ara Kat Dubleks",
        "Bahçe Dubleksi",
        "Çatı Dubleksi",
        "Ters Dubleks",
        "Ara Kat",
        "Tripleks",
        "Bahçe Katı",
        "Yüksek Giriş",
        "Giriş",
      ]),
    ],
  },
  ...commonGroups,
];

const isyeriGroups = [{ name: "Temel Özellikler", key: "temel-ozellikler", fields: konutIsyeriTemel }, ...commonGroups];

const arsaGroups = [
  { name: "Arsa Bilgileri", key: "arsa-bilgileri", fields: arsaTemel },
  {
    name: "Arsa Özellikleri",
    key: "arsa-ozellikleri",
    fields: [
      checkboxField("altyapi", "Altyapı", [
        "Elektrik",
        "Sanayi Elektriği",
        "Su",
        "Telefon",
        "Doğalgaz",
        "Arıtma",
        "Sondaj & Kuyu",
        "Kanalizasyon",
        "Yolu Açılmış",
        "Yolu Açılmamış",
        "Yolu Yok",
      ]),
      checkboxField("konum", "Konum", ["Ana Yola Yakın", "Denize Sıfır", "Denize Yakın", "Havaalanına Yakın", "Toplu Ulaşıma Yakın"]),
      checkboxField("genel_ozellikler", "Genel Özellikler", ["İfrazlı", "Parseli", "Projeli", "Köşe Parsel"]),
      selectField("zemin_etudu", "Zemin Etüdü", ["Var", "Yok"]),
    ],
  },
  commonGroups[2],
];

const projeTemel = [
  textField("brut_m2", "Brüt m²", "number", "m²"),
  textField("net_m2", "Net m²", "number", "m²"),
  textField("oda_sayisi", "Oda Sayısı"),
  textField("salon_sayisi", "Salon Sayısı"),
  textField("banyo_sayisi", "Banyo Sayısı"),
  textField("blok_sayisi", "Blok Sayısı", "number"),
  textField("bagimsiz_bolum", "Bağımsız Bölüm", "number"),
  textField("teslim_tarihi", "Teslim Tarihi"),
  textField("proje_alani", "Proje Alanı", "number", "m²"),
  textField("fiyat_araligi", "Fiyat Aralığı"),
];

const projeGroups = [
  { name: "Proje Bilgileri", key: "proje-bilgileri", fields: projeTemel },
  {
    name: "Proje Tipi",
    key: "proje-tipi",
    fields: [
      selectField("proje_tipi", "Proje Tipi", [
        "Konut Projesi",
        "Villa Projesi",
        "Ticari Proje",
        "Karma Proje",
        "Ofis Projesi",
      ]),
    ],
  },
  {
    name: "Sosyal Donatilar",
    key: "sosyal-donatilar",
    fields: [
      checkboxField("sosyal_donatilar", "Sosyal Donatilar", [
        "Kapali Otopark",
        "Acik Otopark",
        "Yuzme Havuzu",
        "Cocuk Oyun Alani",
        "Spor Salonu",
        "Sauna",
        "Guvenlik",
        "Kafe ve Ticari Alanlar",
        "Peyzaj Alani",
        "Yuruyus Parkuru",
      ]),
    ],
  },
  commonGroups[2],
];

function subcategories(names, groups) {
  return names.map((name) => ({ name, slug: slug(name), propertyGroups: groups }));
}

async function seedSertifikalar() {
  await PageContent.updateOne(
    { pageKey: "sertifikalar" },
    {
      $setOnInsert: {
        pageKey: "sertifikalar",
        title: "Sertifikalar",
        sections: [
          {
            key: "banner",
            label: "Banner",
            blocks: [
              { key: "bannerText", label: "Banner Yazısı", type: "text", value: "" },
            ],
          },
        ],
      },
    },
    { upsert: true },
  );
}

async function seed() {
  await connectDatabase();

  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin123", 10);
  await AdminUser.updateOne(
    { email: process.env.ADMIN_EMAIL || "admin@cevikemlak.test" },
    {
      email: process.env.ADMIN_EMAIL || "admin@cevikemlak.test",
      passwordHash,
      name: "Cevik Emlak Admin",
      role: "admin",
    },
    { upsert: true },
  );

  const agent = await Agent.findOneAndUpdate(
    { email: "nurcan@cevikemlak.test" },
    {
      name: "Nurcan Karpek",
      title: "Sorumlu Gayrimenkul Danışmanı",
      phones: ["0(216) 356 05 05", "0(532) 768 51 95"],
      email: "nurcan@cevikemlak.test",
      active: true,
    },
    { new: true, upsert: true },
  );

  const categoryPayloads = [
    {
      name: "Konut",
      slug: "konut",
      svg: iconLibrary.apartment,
      saleTypes: ["satilik", "kiralik"],
      order: 1,
      propertyGroups: konutGroups,
      subcategories: subcategories(["Apartman Dairesi", "Rezidans", "Yalı Dairesi", "Müstakil Ev", "Bina", "Villa", "Yalı"], konutGroups),
    },
    {
      name: "İşyeri",
      slug: "isyeri",
      svg: iconLibrary.shop,
      saleTypes: ["satilik", "kiralik"],
      order: 2,
      propertyGroups: isyeriGroups,
      subcategories: subcategories(
        ["Apartman Dairesi", "Ofis", "Dükkan/Mağaza", "Komple Bina", "Plaza Katı/Ofisi", "İş Hanı Katı/Ofisi", "Fabrika & Üretim Tesisi", "Restoran/Lokanta"],
        isyeriGroups,
      ),
    },
    {
      name: "Arsa",
      slug: "arsa",
      svg: iconLibrary.land,
      saleTypes: ["satilik", "kiralik"],
      order: 3,
      propertyGroups: arsaGroups,
      subcategories: subcategories(["Konut İmarlı", "Ticari İmarlı", "Zeytinlik", "Tarla", "Ticari+Konut", "Lojistik"], arsaGroups),
    },
    {
      name: "Proje",
      slug: "proje",
      svg: iconLibrary.project,
      saleTypes: ["satilik"],
      order: 4,
      propertyGroups: projeGroups,
      subcategories: subcategories(["Konut Projesi", "Villa Projesi", "Ticari Proje", "Karma Proje"], projeGroups),
    },
  ];

  for (const payload of categoryPayloads) {
    await Category.updateOne({ slug: payload.slug }, payload, { upsert: true });
  }

  const [konut, arsa, proje] = await Promise.all([
    Category.findOne({ slug: "konut" }),
    Category.findOne({ slug: "arsa" }),
    Category.findOne({ slug: "proje" }),
  ]);

  await Listing.updateOne(
    { listingNo: "3358" },
    {
      title: "Bodrum Akturda Ön Sırada Kapanmaz Deniz Manzaralı Satılık Villa",
      slug: "bodrum-akturada-deniz-manzarali-villa-3358",
      listingNo: "3358",
      transactionType: "satilik",
      category: konut._id,
      categorySlug: "konut",
      subcategory: "Villa",
      status: "published",
      badges: [{ text: "Satılık", variant: "kiralik" }, { text: "Fırsat Ürünü", variant: "firsat" }],
      price: 28500000,
      city: "Muğla",
      district: "Bodrum",
      neighborhood: "Bitez",
      areaGross: 135,
      areaNet: 105,
      rooms: "3",
      salons: "1",
      bathrooms: "2",
      summary: "Bodrum Bitez'de ön sırada, kapanmaz deniz manzaralı, yaz kış oturuma uygun müstakil villa.",
      highlights: ["En Ön Sırada", "Kapanmaz deniz manzarası", "Onaylı tadilat projesi", "Yaz kış oturum"],
      propertyValues: {
        brut_m2: 135,
        net_m2: 105,
        oda_sayisi: "3+1",
        konut_tipi: "Bahçe Dubleksi",
        manzara: ["Deniz", "Kapanmaz Deniz Manzaralı"],
        dis_ozellikler: ["Açık Otopark", "Sosyal Tesisler"],
      },
      images: [{ url: "/ilan-detay1.webp", isCover: true }, { url: "/ilan-detay2.webp" }, { url: "/ilan-detay3.webp" }],
      agent: agent._id,
      active: true,
      publishedAt: new Date(),
    },
    { upsert: true },
  );

  await Listing.updateOne(
    { listingNo: "4451" },
    {
      title: "Yatırımlık Konut İmarlı Arsa",
      slug: "yatirimlik-konut-imarli-arsa-4451",
      listingNo: "4451",
      transactionType: "satilik",
      category: arsa._id,
      categorySlug: "arsa",
      subcategory: "Konut İmarlı",
      status: "published",
      badges: [{ text: "Satılık", variant: "kiralik" }],
      price: 2950000,
      city: "Antalya",
      district: "Muratpaşa",
      areaGross: 520,
      summary: "Ana yola yakın, konut imarlı yatırımlık arsa.",
      highlights: ["Konut imarlı", "Ana yola yakın", "Köşe parsel"],
      propertyValues: {
        imar_durumu: "Konut İmarlı",
        arazi_m2: 520,
        m2_fiyati: 5673,
        ada_no: "123",
        parsel_no: "8",
        altyapi: ["Elektrik", "Su"],
        konum: ["Ana Yola Yakın"],
        zemin_etudu: "Var",
      },
      images: [{ url: "/ilanlar6.png", isCover: true }],
      agent: agent._id,
      active: true,
      publishedAt: new Date(),
    },
    { upsert: true },
  );

  await Listing.updateOne(
    { listingNo: "9001" },
    {
      title: "Cadde Panorama Residence Projesi",
      slug: "cadde-panorama-residence-projesi-9001",
      listingNo: "9001",
      transactionType: "satilik",
      category: proje._id,
      categorySlug: "proje",
      subcategory: "Konut Projesi",
      status: "published",
      badges: [{ text: "Satilik", variant: "kiralik" }, { text: "Yeni", variant: "kiralik" }],
      price: 12450000,
      city: "Istanbul",
      district: "Kadikoy",
      neighborhood: "Fikirtepe",
      areaGross: 182,
      areaNet: 146,
      rooms: "3",
      salons: "1",
      bathrooms: "2",
      summary: "Merkezi lokasyonda, sosyal donatili yeni nesil konut projesi.",
      highlights: ["Lansmana ozel fiyat", "Teslim 2027", "Kapali otopark", "Sosyal tesis"],
      propertyValues: {
        brut_m2: 182,
        net_m2: 146,
        oda_sayisi: "3+1",
        salon_sayisi: "1",
        banyo_sayisi: "2",
        blok_sayisi: 4,
        bagimsiz_bolum: 186,
        teslim_tarihi: "Aralik 2027",
        proje_alani: 18400,
        fiyat_araligi: "12.450.000 TL - 24.900.000 TL",
        proje_tipi: "Konut Projesi",
        sosyal_donatilar: ["Kapali Otopark", "Yuzme Havuzu", "Guvenlik", "Peyzaj Alani"],
        manzara: ["Sehir", "Park/Yesil Alan"],
      },
      images: [{ url: "/ilan-detay1.webp", isCover: true }, { url: "/ilan-detay2.webp" }, { url: "/ilan-detay3.webp" }],
      agent: agent._id,
      active: true,
      publishedAt: new Date(),
    },
    { upsert: true },
  );

  await Listing.updateOne(
    { listingNo: "9002" },
    {
      title: "Marina Vadi Villa Projesi",
      slug: "marina-vadi-villa-projesi-9002",
      listingNo: "9002",
      transactionType: "satilik",
      category: proje._id,
      categorySlug: "proje",
      subcategory: "Villa Projesi",
      status: "published",
      badges: [{ text: "Satilik", variant: "kiralik" }, { text: "Firsat Urunu", variant: "firsat" }],
      price: 36800000,
      city: "Izmir",
      district: "Cesme",
      neighborhood: "Alacati",
      areaGross: 320,
      areaNet: 268,
      rooms: "5",
      salons: "1",
      bathrooms: "4",
      summary: "Deniz manzarali, butik villa projesi.",
      highlights: ["Deniz manzarasi", "Butik konsept", "Acilis fiyati", "Teslim 2026"],
      propertyValues: {
        brut_m2: 320,
        net_m2: 268,
        oda_sayisi: "5+1",
        salon_sayisi: "1",
        banyo_sayisi: "4",
        blok_sayisi: 1,
        bagimsiz_bolum: 18,
        teslim_tarihi: "Eylul 2026",
        proje_alani: 9600,
        fiyat_araligi: "36.800.000 TL - 49.500.000 TL",
        proje_tipi: "Villa Projesi",
        sosyal_donatilar: ["Acik Otopark", "Guvenlik", "Peyzaj Alani", "Yuruyus Parkuru"],
        manzara: ["Deniz", "Bahce"],
      },
      images: [{ url: "/ilanlar6.png", isCover: true }, { url: "/lokasyon1.png" }, { url: "/lokasyon2.png" }],
      agent: agent._id,
      active: true,
      publishedAt: new Date(),
    },
    { upsert: true },
  );

  await Listing.updateOne(
    { listingNo: "9003" },
    {
      title: "Merkez Ofis Park Karma Projesi",
      slug: "merkez-ofis-park-karma-projesi-9003",
      listingNo: "9003",
      transactionType: "satilik",
      category: proje._id,
      categorySlug: "proje",
      subcategory: "Karma Proje",
      status: "published",
      badges: [{ text: "Satilik", variant: "kiralik" }, { text: "Yeni", variant: "kiralik" }],
      price: 8750000,
      city: "Ankara",
      district: "Cankaya",
      neighborhood: "Sogutozu",
      areaGross: 138,
      areaNet: 104,
      rooms: "2",
      salons: "1",
      bathrooms: "1",
      summary: "Ofis ve rezidans birimlerini bir araya getiren merkezi karma proje.",
      highlights: ["Prestijli lokasyon", "Ofis + rezidans", "Metroya yakin", "Yatirim odakli"],
      propertyValues: {
        brut_m2: 138,
        net_m2: 104,
        oda_sayisi: "2+1",
        salon_sayisi: "1",
        banyo_sayisi: "1",
        blok_sayisi: 2,
        bagimsiz_bolum: 242,
        teslim_tarihi: "Haziran 2028",
        proje_alani: 22450,
        fiyat_araligi: "8.750.000 TL - 19.250.000 TL",
        proje_tipi: "Karma Proje",
        sosyal_donatilar: ["Kapali Otopark", "Kafe ve Ticari Alanlar", "Guvenlik", "Spor Salonu"],
        manzara: ["Sehir"],
      },
      images: [{ url: "/slider1.png", isCover: true }, { url: "/blog1.png" }, { url: "/blog2.png" }],
      agent: agent._id,
      active: true,
      publishedAt: new Date(),
    },
    { upsert: true },
  );

  await Listing.updateOne(
    { listingNo: "9004" },
    {
      title: "Sahil Yasam Konut Projesi",
      slug: "sahil-yasam-konut-projesi-9004",
      listingNo: "9004",
      transactionType: "satilik",
      category: proje._id,
      categorySlug: "proje",
      subcategory: "Konut Projesi",
      status: "published",
      badges: [{ text: "Satilik", variant: "kiralik" }, { text: "Yeni", variant: "kiralik" }],
      price: 15900000,
      city: "Mugla",
      district: "Bodrum",
      neighborhood: "Yalikavak",
      areaGross: 210,
      areaNet: 168,
      rooms: "4",
      salons: "1",
      bathrooms: "3",
      summary: "Denize yakin konumu ve aile yasamina uygun sosyal alanlariyla yeni proje.",
      highlights: ["Denize yakin", "Aile konsepti", "Guvenlikli site", "Teslim 2027"],
      propertyValues: {
        brut_m2: 210,
        net_m2: 168,
        oda_sayisi: "4+1",
        salon_sayisi: "1",
        banyo_sayisi: "3",
        blok_sayisi: 3,
        bagimsiz_bolum: 96,
        teslim_tarihi: "Mayis 2027",
        proje_alani: 12750,
        fiyat_araligi: "15.900.000 TL - 27.400.000 TL",
        proje_tipi: "Konut Projesi",
        sosyal_donatilar: ["Kapali Otopark", "Acik Havuz", "Guvenlik", "Cocuk Oyun Alani"],
        manzara: ["Deniz", "Dogal Alan"],
      },
      images: [{ url: "/lokasyon3.png", isCover: true }, { url: "/ilan-detay1.webp" }, { url: "/ilan-detay2.webp" }],
      agent: agent._id,
      active: true,
      publishedAt: new Date(),
    },
    { upsert: true },
  );

  await BlogPost.updateOne(
    { slug: "konut-piyasasinda-2026" },
    {
      title: "Konut Piyasasında 2026 Yılı Beklentileri",
      slug: "konut-piyasasinda-2026",
      excerpt: "Konut piyasasındaki arz, talep ve fiyat dinamiklerine kısa bir bakış.",
      content: "<p>Bu alan admin panelinden güncellenebilir.</p>",
      descriptionHtml: "<p>Bu alan admin panelinden güncellenebilir.</p>",
      gallery: ["/blog-detail-image.jpg", "/blog1.png"],
      sectoralComment: {
        title: "Sektörel not",
        authorName: "Uzman görüşü",
        description: "Piyasayı düzenli takip etmek uzun vadeli doğru kararlar için kritiktir.",
      },
      coverImage: "/blog1.png",
      status: "published",
      publishedAt: new Date(),
    },
    { upsert: true },
  );

  // (Eski ön seed - artık findOrCreate ile yönetiliyor, $setOnInsert ile korunuyor)

  await PageContent.updateOne(
    { pageKey: "home" },
    { $setOnInsert: {
      pageKey: "home",
      title: "Ana Sayfa",
      sections: [
        {
          key: "slider",
          label: "Slider",
          blocks: [
            { key: "titleLine1", label: "Baslik 1. Satir", type: "text", value: "Dogru Zaman. Dogru" },
            { key: "titleLine2", label: "Baslik 2. Satir", type: "text", value: "Karar. Dogru Gayrimenkul." },
            { key: "description", label: "Slider Aciklama", type: "textarea", value: "Akilli filtreler ve detayli karsilastirmalarla firsatlari yakalayin; uzman ekibimizle islemlerinizi sorunsuz ve guvenle tamamlayin." },
            { key: "backgroundImage", label: "1. Slider Medyasi", type: "media", value: "/slider1.png" },
            { key: "backgroundImageSecond", label: "2. Slider Medyasi", type: "media", value: "/slider1.png" },
            { key: "topImage", label: "Baslik Ic Gorseli", type: "image", value: "/slider-ustu.png" },
          ],
        },
        {
          key: "about",
          label: "Hakkimizda",
          blocks: [
            { key: "badge", label: "Ust Etiket", type: "text", value: "HAKKIMIZDA" },
            { key: "title", label: "Baslik", type: "textarea", value: "Guven, Tecrube,\nDostluk" },
            { key: "description", label: "Aciklama", type: "textarea", value: "Hizmetlerimizi her zaman icin musteri memnuniyeti ve guven ilkelerini temel alarak sunmaktayiz." },
            { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Daha Fazla Bilgi" },
            { key: "ctaHref", label: "Buton Linki", type: "text", value: "/hakkimizda" },
            { key: "year", label: "Yil Metni", type: "text", value: "1987" },
            { key: "videoUrl", label: "Tanitim Videosu", type: "media", value: "" },
            { key: "stats", label: "Istatistikler", type: "stat-list", value: [{ n: "36+", l1: "Yillik", l2: "Sektor Tecrubesi" }, { n: "1K+", l1: "Mutlu", l2: "Musteri" }, { n: "12", l1: "Calisan Ile Profesyonel", l2: "Hizmet Anlayisi" }] },
          ],
        },
        {
          key: "listings",
          label: "Ilanlar",
          blocks: [
            { key: "badge", label: "Ust Etiket", type: "text", value: "SIZIN ICIN" },
            { key: "title", label: "Baslik", type: "text", value: "Guvenle Arayin, Kolayca Sahip Olun" },
            { key: "description", label: "Aciklama", type: "textarea", value: "Dogru evi bulmaniz icin guvenilir ilanlar, guclu filtreleme ve uzman destegi sunuyoruz." },
            { key: "hotlineLabel", label: "Danisman Etiketi", type: "text", value: "Danisman Hatti" },
            { key: "hotlinePhone", label: "Telefon", type: "text", value: "0(216) 356 05 05" },
            { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Tumunu Gor" },
            { key: "ctaHref", label: "Buton Linki", type: "text", value: "/ilanlar" },
            { key: "filters", label: "Filtreler", type: "string-list", value: ["Tumu", "Daireler", "Ticari", "Villa"] },
          ],
        },
        {
          key: "featured",
          label: "One Cikan",
          blocks: [
            { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Projeyi Incele ->" },
            { key: "projects", label: "One Cikan Projeler", type: "featured-project-list", value: [{ id: "1", listingId: "9001", title: "Cadde Panorama Residence", description: "Merkezi lokasyonda, sosyal donatili yeni nesil konut projesi." }, { id: "2", listingId: "9002", title: "Marina Vadi Villa Projesi", description: "Deniz manzarali, butik villa projesi." }, { id: "3", listingId: "9003", title: "Merkez Ofis Park Karma Projesi", description: "Ofis ve rezidans birimlerini bir araya getiren merkezi karma proje." }, { id: "4", listingId: "9004", title: "Sahil Yasam Konut Projesi", description: "Denize yakin konumu ve aile yasamina uygun sosyal alanlariyla yeni proje." }] },
          ],
        },
        {
          key: "locations",
          label: "Lokasyon",
          blocks: [
            { key: "badge", label: "Ust Etiket", type: "text", value: "Lokasyona gore" },
            { key: "title", label: "Baslik", type: "textarea", value: "Lokasyona Gore\nKesfedin" },
            { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Tumunu Gor" },
            { key: "ctaHref", label: "Buton Linki", type: "text", value: "/ilanlar" },
            { key: "cards", label: "Lokasyon Kartlari", type: "location-list", value: [{ image: "/lokasyon1.png", title: "Ankara / Cankaya", city: "Ankara", district: "Cankaya", count: 3 }, { image: "/lokasyon2.png", title: "Izmir / Karsiyaka", city: "Izmir", district: "Karsiyaka", count: 7 }, { image: "/lokasyon3.png", title: "Bursa / Nilufer", city: "Bursa", district: "Nilufer", count: 4 }, { image: "/lokasyon4.png", title: "Adana / Seyhan", city: "Adana", district: "Seyhan", count: 2 }] },
          ],
        },
        {
          key: "blog",
          label: "Blog",
          blocks: [
            { key: "badge", label: "Ust Etiket", type: "text", value: "BIZDEN HABERLER" },
            { key: "title", label: "Baslik", type: "text", value: "Piyasayi ve Bizi Kesfedin" },
            { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Tumunu Gor" },
            { key: "ctaHref", label: "Buton Linki", type: "text", value: "/bloglar" },
            { key: "featured", label: "One Cikan Yazi", type: "blog-featured-list", value: [{ image: "/blog-detail-image.jpg", date: "2 Gun Once", title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", slug: "1" }] },
            { key: "side", label: "Yandaki Yazilar", type: "blog-side-list", value: [{ title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", date: "2 Gun Once", image: "/blog-mini.png", slug: "2" }, { title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", date: "2 Gun Once", image: "/blog2.png", slug: "3" }, { title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", date: "2 Gun Once", image: "/blog3.png", slug: "4" }, { title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", date: "2 Gun Once", image: "/blog1.png", slug: "5" }] },
          ],
        },
      ],
    } },
    { upsert: true },
  );

  // ── Hakkımızda sayfası ──
  await PageContent.updateOne(
    { pageKey: "hakkimizda" },
    { $setOnInsert: {
      pageKey: "hakkimizda",
      title: "Hakkımızda",
      sections: [
        {
          key: "banner",
          label: "Banner",
          blocks: [
            { key: "bannerMedia", label: "Banner Görseli / Videosu", type: "media", value: "" },
            { key: "bannerTitle1Text1", label: "Banner Başlık 1. Satır 1. Yazı", type: "text", value: "" },
            { key: "bannerTitle1Text2", label: "Banner Başlık 1. Satır 2. Yazı", type: "text", value: "" },
            { key: "bannerTitle2", label: "Banner Başlık 2. Satır", type: "text", value: "" },
          ],
        },
        {
          key: "intro",
          label: "Giriş",
          blocks: [
            { key: "subTitle", label: "Sol Başlık", type: "text", value: "" },
            { key: "title", label: "Ana Başlık", type: "text", value: "" },
            { key: "subtext", label: "Alt Başlık", type: "text", value: "" },
          ],
        },
        {
          key: "images",
          label: "Görseller",
          blocks: [
            { key: "image1", label: "Görsel 1", type: "image", value: "" },
            { key: "image2", label: "Görsel 2", type: "image", value: "" },
            { key: "image3", label: "Görsel 3", type: "image", value: "" },
            { key: "image4", label: "Görsel 4", type: "image", value: "" },
          ],
        },
        {
          key: "content",
          label: "İçerik",
          blocks: [
            { key: "leftLine1", label: "Sol Başlık 1. Satır", type: "text", value: "" },
            { key: "leftLine2", label: "Sol Başlık 2. Satır", type: "text", value: "" },
            { key: "leftLine3", label: "Sol Başlık 3. Satır", type: "text", value: "" },
            { key: "leftLine4", label: "Sol Başlık 4. Satır", type: "text", value: "" },
            { key: "stat1Value", label: "1. İstatistik Değeri", type: "text", value: "" },
            { key: "stat1Title", label: "1. İstatistik Başlığı", type: "text", value: "" },
            { key: "stat1Desc", label: "1. İstatistik Açıklama", type: "text", value: "" },
            { key: "stat2Value", label: "2. İstatistik Değeri", type: "text", value: "" },
            { key: "stat2Title", label: "2. İstatistik Başlığı", type: "text", value: "" },
            { key: "stat2Desc", label: "2. İstatistik Açıklama", type: "text", value: "" },
          ],
        },
        {
          key: "bottomMedia",
          label: "Alt Medya",
          blocks: [
            { key: "media", label: "Alt Medya (Resim / Video)", type: "media", value: "" },
          ],
        },
        {
          key: "timeline",
          label: "Kronolojik Geçmiş",
          blocks: [
            { key: "items", label: "Zaman Çizelgesi", type: "timeline-list", value: [] },
          ],
        },
      ],
    } },
    { upsert: true },
  );

  await PageContent.updateOne(
    { pageKey: "bloglar" },
    { $setOnInsert: BLOG_PAGE_TEMPLATE },
    { upsert: true },
  );

  await seedSertifikalar();

  console.log("Seed tamamlandi");
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
