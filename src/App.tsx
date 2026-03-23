import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, Settings, Save } from 'lucide-react';
import { 
  fetchHotelData, 
  getPhysicalRooms, 
  getTodayDate, 
  ALL_ROOMS, 
  MOCK_DATA, 
  Reservation, 
  RoomSplitRule 
} from './services/api';

const DEFAULT_RULES: RoomSplitRule[] = [
  { baseRoom: "2507", targetRooms: ["2507", "2607"] },
  { baseRoom: "4401", targetRooms: ["4401", "4500", "4501"] },
  { baseRoom: "5211", targetRooms: ["5211", "5213"] }
];

type TabType = 'girisYapacak' | 'girisYapti' | 'cikisYapacak' | 'cikisYapti' | 'konaklayan' | 'hareketYok' | 'ayarlar';

const TABS: { id: TabType; label: string }[] = [
  { id: 'girisYapacak', label: 'Giriş Yapacak' },
  { id: 'girisYapti', label: 'Giriş Yaptı' },
  { id: 'cikisYapacak', label: 'Çıkış Yapacak' },
  { id: 'cikisYapti', label: 'Çıkış Yaptı' },
  { id: 'konaklayan', label: 'Konaklayan' },
  { id: 'hareketYok', label: 'Hareket Yok' },
  { id: 'ayarlar', label: 'Ayarlar' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('girisYapacak');
  
  // Rules State
  const [rules, setRules] = useState<RoomSplitRule[]>(() => {
    const saved = localStorage.getItem('roomSplitRules');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error("Kayıtlı kurallar okunamadı", e); }
    }
    return DEFAULT_RULES;
  });
  
  const [rulesInput, setRulesInput] = useState(JSON.stringify(rules, null, 2));
  const [rulesError, setRulesError] = useState('');
  const [rulesSuccess, setRulesSuccess] = useState(false);

  // Data State
  const [rawData, setRawData] = useState<{
    girisYapacak: Reservation[];
    girisYapti: Reservation[];
    cikisYapacak: Reservation[];
    cikisYapti: Reservation[];
    konaklayan: Reservation[];
  }>({
    girisYapacak: [], girisYapti: [], cikisYapacak: [], cikisYapti: [], konaklayan: []
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);

  // Processed Rooms (Derived state)
  const processedData = useMemo(() => {
    const girisYapacak = getPhysicalRooms(rawData.girisYapacak, rules);
    const girisYapti = getPhysicalRooms(rawData.girisYapti, rules);
    const cikisYapacak = getPhysicalRooms(rawData.cikisYapacak, rules);
    const cikisYapti = getPhysicalRooms(rawData.cikisYapti, rules);
    const konaklayan = getPhysicalRooms(rawData.konaklayan, rules);

    // Hareket Yok Hesaplaması: Tüm odalar - (Giriş Yapacak + Giriş Yaptı + Çıkış Yapacak + Çıkış Yaptı + Konaklayan)
    const allActiveRooms = new Set([
      ...girisYapacak, ...girisYapti, ...cikisYapacak, ...cikisYapti, ...konaklayan
    ]);
    
    const hareketYok = ALL_ROOMS.filter(r => !allActiveRooms.has(r)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return { girisYapacak, girisYapti, cikisYapacak, cikisYapti, konaklayan, hareketYok };
  }, [rawData, rules]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setUsingMockData(false);

    try {
      const token = import.meta.env.VITE_HOTEL_API_TOKEN || import.meta.env.VITE_API_KEY;
      
      if (!token || token === 'YOUR_BEARER_TOKEN_HERE') {
        throw new Error("API Token bulunamadı. Lütfen .env dosyasındaki VITE_HOTEL_API_TOKEN değerini güncelleyin.");
      }

      const BUGUN = getTodayDate();
      
      // 5 Farklı Sorgunun 'Where' Koşulları
      const queries = {
        girisYapacak: [
          {"Column": "RESSTATEID", "Operator": "=", "Value": "2"},
          {"Column": "CHECKIN", "Operator": "=", "Value": BUGUN}
        ],
        girisYapti: [
          {"Column": "RESSTATEID", "Operator": "=", "Value": "3"},
          {"Column": "CHECKIN", "Operator": "=", "Value": BUGUN}
        ],
        cikisYapacak: [
          {"Column": "RESSTATEID", "Operator": "=", "Value": "3"},
          {"Column": "CHECKOUT", "Operator": "=", "Value": BUGUN}
        ],
        cikisYapti: [
          {"Column": "RESSTATEID", "Operator": "=", "Value": "4"},
          {"Column": "CHECKOUT", "Operator": "=", "Value": BUGUN}
        ],
        konaklayan: [
          {"Column": "RESSTATEID", "Operator": "=", "Value": "3"},
          {"Column": "CHECKINDATE", "Operator": "<>", "Value": BUGUN},
          {"Column": "CHECKOUTDATE", "Operator": "<>", "Value": BUGUN}
        ]
      };

      // Tüm API isteklerini paralel olarak at (Performans için)
      const [resGirisYapacak, resGirisYapti, resCikisYapacak, resCikisYapti, resKonaklayan] = await Promise.all([
        fetchHotelData(queries.girisYapacak, token, "Giriş Yapacak"),
        fetchHotelData(queries.girisYapti, token, "Giriş Yaptı"),
        fetchHotelData(queries.cikisYapacak, token, "Çıkış Yapacak"),
        fetchHotelData(queries.cikisYapti, token, "Çıkış Yaptı"),
        fetchHotelData(queries.konaklayan, token, "Konaklayan"),
      ]);

      setRawData({
        girisYapacak: resGirisYapacak,
        girisYapti: resGirisYapti,
        cikisYapacak: resCikisYapacak,
        cikisYapti: resCikisYapti,
        konaklayan: resKonaklayan
      });
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Veri çekilirken bir hata oluştu.");
      
      // Hata durumunda mock veriyi kullan
      console.log("Mock veri kullanılıyor...");
      setUsingMockData(true);
      setRawData({
        girisYapacak: MOCK_DATA.girisYapacak as Reservation[],
        girisYapti: MOCK_DATA.girisYapti as Reservation[],
        cikisYapacak: MOCK_DATA.cikisYapacak as Reservation[],
        cikisYapti: MOCK_DATA.cikisYapti as Reservation[],
        konaklayan: MOCK_DATA.konaklayan as Reservation[],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveRules = () => {
    try {
      const parsed = JSON.parse(rulesInput);
      if (!Array.isArray(parsed)) throw new Error("Kurallar bir dizi (array) olmalıdır.");
      const isValid = parsed.every(rule => rule.baseRoom && Array.isArray(rule.targetRooms));
      if (!isValid) throw new Error("Her kuralın 'baseRoom' (string) ve 'targetRooms' (array) alanları olmalıdır.");

      setRules(parsed);
      localStorage.setItem('roomSplitRules', JSON.stringify(parsed));
      setRulesError('');
      setRulesSuccess(true);
      setTimeout(() => setRulesSuccess(false), 3000);
    } catch (err: any) {
      setRulesError(err.message || "Geçersiz JSON formatı.");
      setRulesSuccess(false);
    }
  };

  // Ekranda gösterilecek mevcut liste
  const currentList = activeTab === 'ayarlar' ? [] : processedData[activeTab];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-20">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight">Mini Bar List</h1>
          <button 
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
            aria-label="Yenile"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Horizontal Scrollable Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-[60px] z-10 shadow-sm">
        <div className="max-w-md mx-auto">
          <div className="flex overflow-x-auto hide-scrollbar px-2 py-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id 
                    ? 'text-blue-600 border-blue-600' 
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.id !== 'ayarlar' && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {processedData[tab.id as keyof typeof processedData]?.length || 0}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 pb-20">
        
        {/* Status Messages */}
        {error && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-amber-800 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Bağlantı Hatası</p>
              <p className="mt-1 opacity-90">{error}</p>
              {error.includes('401') && (
                <div className="mt-2 p-2 bg-red-100 text-red-800 rounded text-xs">
                  <p className="font-bold">💡 Çözüm Adımları:</p>
                  <ol className="list-decimal ml-4 mt-1 space-y-1">
                    <li>Kullandığınız Bearer Token'ın süresi dolmuş olabilir. Yeni bir token alın.</li>
                    <li>Sol menüden <strong>Settings &gt; Secrets</strong> kısmına gidin.</li>
                    <li><strong>VITE_HOTEL_API_TOKEN</strong> (veya VITE_API_KEY) değerini güncelleyin.</li>
                  </ol>
                </div>
              )}
              <p className="mt-2 text-xs font-semibold">Şu an test verisi (Mock Data) gösteriliyor.</p>
            </div>
          </div>
        )}

        {!error && !loading && !usingMockData && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 text-green-800 text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p className="font-medium">Tüm canlı veriler başarıyla çekildi.</p>
          </div>
        )}

        {/* Dynamic Content Based on Tab */}
        {activeTab !== 'ayarlar' ? (
          <div className="animate-in fade-in duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h2 className="font-semibold text-gray-700">
                  {TABS.find(t => t.id === activeTab)?.label} Odaları
                </h2>
              </div>
              
              {loading && currentList.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 opacity-50" />
                  <p>Veriler yükleniyor...</p>
                </div>
              ) : currentList.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>Bu kategoride oda bulunamadı.</p>
                </div>
              ) : (
                <div className="p-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {currentList.map((room, index) => (
                    <div 
                      key={index} 
                      className="p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-lg text-center transition-colors cursor-default"
                    >
                      <span className="font-mono text-lg font-bold text-gray-800">{room}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-semibold text-gray-700">Dinamik Kural Motoru</h2>
                <p className="text-xs text-gray-500 mt-1">Bölünebilir odaların kurallarını JSON formatında düzenleyin. Değişiklikler anında listelere yansır.</p>
              </div>
              
              <div className="p-4">
                <textarea
                  value={rulesInput}
                  onChange={(e) => setRulesInput(e.target.value)}
                  className="w-full h-64 p-3 font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                  spellCheck="false"
                />
                
                {rulesError && (
                  <p className="mt-3 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> {rulesError}
                  </p>
                )}
                
                {rulesSuccess && (
                  <p className="mt-3 text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Kurallar başarıyla kaydedildi!
                  </p>
                )}

                <button
                  onClick={handleSaveRules}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Kuralları Kaydet
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
