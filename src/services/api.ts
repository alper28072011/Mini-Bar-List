export interface Reservation {
  ROOMNO?: string | null;
  RESSTATE?: string;
  CHECKIN?: string;
  CHECKOUT?: string;
  CHECKINDATE?: string;
  CHECKOUTDATE?: string;
  ALLNOTES?: string;
}

export interface RoomSplitRule {
  baseRoom: string;
  targetRooms: string[];
}

// Şimdilik örnek 30 oda. İleride burayı otelin tüm odalarıyla doldurabilirsiniz.
export const ALL_ROOMS: string[] = [
  "1101", "1102", "1103", "1104", "1105", "1106", "1107", "1108", "1109", "1110",
  "2507", "2607", "2508", "2608",
  "4401", "4500", "4501", "4402", "4502",
  "5211", "5213", "5215", "5217",
  "305", "306", "307", "308"
];

/**
 * Bugünün tarihini her zaman YYYY-MM-DD formatında döndürür.
 */
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Gelen oda numarasını ve notları analiz ederek gerçek fiziksel oda numaralarını döndürür.
 */
export function processRoomNumber(roomNo: string | null | undefined, allNotes: string | undefined, rules: RoomSplitRule[]): string[] {
  // ROOMNO null veya undefined ise atla
  if (!roomNo) return [];

  const cleanRoomNo = roomNo.trim();
  const rule = rules.find(r => r.baseRoom === cleanRoomNo);

  let roomsToReturn: string[] = [];

  if (rule) {
    // Bölünebilir oda (Kural Motoru)
    if (!allNotes || allNotes.trim() === "") {
      roomsToReturn = [...rule.targetRooms];
    } else {
      const mentionedRooms = rule.targetRooms.filter(room => allNotes.includes(room));
      if (mentionedRooms.length > 0) {
        roomsToReturn = mentionedRooms;
      } else {
        roomsToReturn = [...rule.targetRooms];
      }
    }
  } else {
    // Kural yoksa "-" işaretinden parçala
    roomsToReturn = cleanRoomNo.split('-').map(r => r.trim());
  }

  // "S" veya "T" harfi içerenleri filtrele
  return roomsToReturn.filter(r => {
    const upperR = r.toUpperCase();
    return !upperR.includes('S') && !upperR.includes('T');
  });
}

/**
 * Rezervasyon listesini alıp, işlenmiş ve filtrelenmiş tekil (unique) fiziksel oda listesini döndürür.
 */
export function getPhysicalRooms(reservations: Reservation[], rules: RoomSplitRule[]): string[] {
  const physicalRooms = new Set<string>();

  reservations.forEach(res => {
    const rooms = processRoomNumber(res.ROOMNO, res.ALLNOTES, rules);
    rooms.forEach(r => {
      if (r) physicalRooms.add(r);
    });
  });

  // Set'i Array'e çevir ve alfabetik/numerik sırala
  return Array.from(physicalRooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Merkezi API İstek Fonksiyonu
 * Verilen whereClauses dizisini kullanarak Hotel Advisor'dan veri çeker.
 */
export async function fetchHotelData(whereClauses: any[], token: string, queryName: string): Promise<Reservation[]> {
  const body = {
    "Parameters": { "HOTELID": "21390" },
    "Action": "Select",
    "Object": "QA_HOTEL_RESERVATION",
    "Where": whereClauses,
    "Paging": { "ItemsPerPage": 10000, "Current": 1 }
  };

  console.log(`[API Request] ${queryName} - Payload:`, JSON.stringify(body));

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
        throw new Error(`API Hatası 401 (Unauthorized): Token geçersiz veya süresi dolmuş. (${queryName})`);
      }
      throw new Error(`API Hatası: ${response.status} ${response.statusText} (${queryName})`);
    }

    const data = await response.json();
    console.log(`[API Response] ${queryName}:`, data);
    
    // API yanıt yapısına göre rezervasyon dizisini çıkar.
    // Gerçek API yanıtında veriler ResultSets[0] içinde geliyor.
    let reservations: Reservation[] = [];
    if (data && Array.isArray(data.ResultSets) && data.ResultSets.length > 0) {
      reservations = data.ResultSets[0];
    } else if (Array.isArray(data)) {
      reservations = data;
    } else {
      reservations = data?.Data || data?.Result || data?.Items || [];
    }
    
    return reservations;
  } catch (error) {
    console.error(`[API Error] ${queryName} çekilemedi:`, error);
    throw error;
  }
}

// Test/Geliştirme amaçlı sahte veri (Mock Data)
export const MOCK_DATA = {
  girisYapacak: [
    { ROOMNO: "1101", RESSTATE: "2", CHECKIN: getTodayDate() },
    { ROOMNO: "2507", RESSTATE: "2", CHECKIN: getTodayDate(), ALLNOTES: "" }
  ],
  girisYapti: [
    { ROOMNO: "1102", RESSTATE: "3", CHECKIN: getTodayDate() }
  ],
  cikisYapacak: [
    { ROOMNO: "4401", RESSTATE: "3", CHECKOUT: getTodayDate(), ALLNOTES: "Misafir 4501 odasında kalmak istiyor." }
  ],
  cikisYapti: [
    { ROOMNO: "1103", RESSTATE: "4", CHECKOUT: getTodayDate() }
  ],
  konaklayan: [
    { ROOMNO: "5211", RESSTATE: "3", CHECKINDATE: "2026-03-20", CHECKOUTDATE: "2026-03-25", ALLNOTES: "Sadece 5211 kullanılacak" },
    { ROOMNO: "305-306", RESSTATE: "3", CHECKINDATE: "2026-03-20", CHECKOUTDATE: "2026-03-25" },
    { ROOMNO: "1104S", RESSTATE: "3" } // Filtrelenecek
  ]
};
