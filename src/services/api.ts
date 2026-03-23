export interface Reservation {
  ROOMNO: string;
  RESSTATE: string;
  CHECKIN: string;
  CHECKOUT: string;
  ALLNOTES?: string;
}

export interface RoomSplitRule {
  baseRoom: string;
  targetRooms: string[];
}

/**
 * Gelen oda numarasını ve notları analiz ederek gerçek fiziksel oda numaralarını döndürür.
 * Kurallar (rules) parametresi üzerinden dinamik olarak çalışır.
 */
export function processRoomNumber(roomNo: string, allNotes: string | undefined, rules: RoomSplitRule[]): string[] {
  if (!roomNo) return [];

  const cleanRoomNo = roomNo.trim();
  const rule = rules.find(r => r.baseRoom === cleanRoomNo);

  let roomsToReturn: string[] = [];

  if (rule) {
    // Eğer oda bölünebilir bir oda ise (kurallarda tanımlıysa)
    if (!allNotes || allNotes.trim() === "") {
      // Not boşsa, tüm alt odaları döndür
      roomsToReturn = [...rule.targetRooms];
    } else {
      // Not varsa, notun içinde geçen alt odaları bul
      const mentionedRooms = rule.targetRooms.filter(room => allNotes.includes(room));
      if (mentionedRooms.length > 0) {
        // Eşleşen varsa sadece onları döndür
        roomsToReturn = mentionedRooms;
      } else {
        // Not var ama spesifik alt oda geçmiyorsa, varsayılan olarak hepsini döndür
        roomsToReturn = [...rule.targetRooms];
      }
    }
  } else {
    // Bölünebilir özel bir oda değilse, '-' işaretinden parçala (örn: "305-306")
    roomsToReturn = cleanRoomNo.split('-').map(r => r.trim());
  }

  // "S" veya "T" harfi içeren odaları filtrele (Büyük/küçük harf duyarsız)
  return roomsToReturn.filter(r => {
    const upperR = r.toUpperCase();
    return !upperR.includes('S') && !upperR.includes('T');
  });
}

/**
 * Rezervasyon listesini alıp, işlenmiş ve filtrelenmiş tekil fiziksel oda listesini döndürür.
 */
export function getPhysicalRooms(reservations: Reservation[], rules: RoomSplitRule[]): string[] {
  const physicalRooms = new Set<string>();

  reservations.forEach(res => {
    const rooms = processRoomNumber(res.ROOMNO, res.ALLNOTES, rules);
    rooms.forEach(r => {
      if (r) physicalRooms.add(r); // Set kullanarak duplicate'leri (tekrarları) otomatik temizliyoruz
    });
  });

  // Set'i Array'e çevir ve sayısal/alfabetik olarak küçükten büyüğe sırala
  return Array.from(physicalRooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Hotel Advisor API'sinden günün "Giriş Yapacak" rezervasyonlarını çeker.
 */
export async function fetchReservations(token: string): Promise<Reservation[]> {
  // Günün tarihini YYYY-MM-DD formatında dinamik olarak al
  const today = new Date().toISOString().split('T')[0];

  const body = {
    "Parameters": { "HOTELID": "21390" },
    "Action": "Select",
    "Object": "QA_HOTEL_RESERVATION",
    "Where": [
      { "Column": "RESSTATEID", "Operator": "=", "Value": "2" },
      { "Column": "CHECKIN", "Operator": "=", "Value": today }
    ],
    "Paging": { "ItemsPerPage": 10000, "Current": 1 }
  };

  try {
    const response = await fetch("https://4001.hoteladvisor.net", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("API Hatası 401 (Unauthorized): Token geçersiz veya süresi dolmuş. Lütfen geçerli bir Bearer token kullanın.");
      }
      throw new Error(`API Hatası: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // API yanıt yapısına göre rezervasyon dizisini çıkar.
    const reservations: Reservation[] = Array.isArray(data) ? data : (data.Data || data.Result || data.Items || []);
    return reservations;
  } catch (error) {
    console.error("Rezervasyonlar çekilemedi:", error);
    throw error;
  }
}

// Test ve geliştirme amaçlı sahte veri
export const MOCK_RESERVATIONS: Reservation[] = [
  { ROOMNO: "101", RESSTATE: "Arrival", CHECKIN: new Date().toISOString().split('T')[0], CHECKOUT: "2026-03-30" },
  { ROOMNO: "2507", RESSTATE: "Arrival", CHECKIN: new Date().toISOString().split('T')[0], CHECKOUT: "2026-03-30", ALLNOTES: "" },
  { ROOMNO: "4401", RESSTATE: "Arrival", CHECKIN: new Date().toISOString().split('T')[0], CHECKOUT: "2026-03-30", ALLNOTES: "Misafir 4501 odasında kalmak istiyor." },
  { ROOMNO: "5211", RESSTATE: "Arrival", CHECKIN: new Date().toISOString().split('T')[0], CHECKOUT: "2026-03-30", ALLNOTES: "Sadece 5211 kullanılacak" },
  { ROOMNO: "102S", RESSTATE: "Arrival", CHECKIN: new Date().toISOString().split('T')[0], CHECKOUT: "2026-03-30" }, // Filtrelenmeli
  { ROOMNO: "305-306", RESSTATE: "Arrival", CHECKIN: new Date().toISOString().split('T')[0], CHECKOUT: "2026-03-30" }, // Parçalanmalı
];
