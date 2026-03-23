import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, Save, Plus, Trash2 } from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { 
  fetchHotelData, 
  getPhysicalRooms, 
  getTodayDate, 
  DEFAULT_SETTINGS, 
  MOCK_DATA, 
  Reservation, 
  HotelSettings,
  SplitRule
} from './services/api';

type TabType = 'girisYapacak' | 'girisYapti' | 'cikisYapacak' | 'cikisYapti' | 'konaklayan' | 'hareketYok' | 'ayarlar';

const TABS: { id: TabType; label: string }[] = [
  { id: 'girisYapacak', label: 'Giriş Yapacak' },
  { id: 'girisYapti', label: 'Giriş Yaptı' },
  { id: 'cikisYapacak', label: 'Çıkış Yapacak' },
  { id: 'cikisYapti', label: 'Çıkış Yaptı' },
  { id: 'konaklayan', label: 'Konaklayan' },
  { id: 'hareketYok', label: 'Hareket Yok' },
  { id: 'ayarlar', label: '⚙️ Ayarlar' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('girisYapacak');
  
  // Settings State (Firestore)
  const [settings, setSettings] = useState<HotelSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Settings UI States
  const [standardRoomsInput, setStandardRoomsInput] = useState(settings.standardRooms.join('\n'));
  const [newRuleMain, setNewRuleMain] = useState('');
  const [newRuleInner, setNewRuleInner] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

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

  // Load Settings from Firestore
  useEffect(() => {
    const docRef = doc(db, 'settings', 'hotel');
    
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as HotelSettings;
        setSettings(data);
        setStandardRoomsInput(data.standardRooms.join('\n'));
      } else {
        // Initialize with default settings if document doesn't exist
        setDoc(docRef, DEFAULT_SETTINGS).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, 'settings/hotel');
        });
      }
      setSettingsLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/hotel');
      setSettingsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Processed Rooms (Derived state)
  const processedData = useMemo(() => {
    const girisYapacak = getPhysicalRooms(rawData.girisYapacak, settings);
    const girisYapti = getPhysicalRooms(rawData.girisYapti, settings);
    const cikisYapacak = getPhysicalRooms(rawData.cikisYapacak, settings);
    const cikisYapti = getPhysicalRooms(rawData.cikisYapti, settings);
    const konaklayan = getPhysicalRooms(rawData.konaklayan, settings);

    // Hareket Yok Hesaplaması: 
    // 1. Toplam Fiziksel Oda Havuzu = Standart Odalar + Tüm Split Kuralı İç Odaları
    const totalPhysicalRooms = new Set<string>([...settings.standardRooms]);
    settings.splitRules.forEach(rule => {
      rule.innerRooms.forEach(r => totalPhysicalRooms.add(r));
    });

    // 2. Aktif Odalar = (Giriş Yapacak + Giriş Yaptı + Çıkış Yapacak + Çıkış Yaptı + Konaklayan)
    const allActiveRooms = new Set([
      ...girisYapacak, ...girisYapti, ...cikisYapacak, ...cikisYapti, ...konaklayan
    ]);
    
    // 3. Hareket Yok = Toplam - Aktif
    const hareketYok = Array.from(totalPhysicalRooms)
      .filter(r => !allActiveRooms.has(r))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return { girisYapacak, girisYapti, cikisYapacak, cikisYapti, konaklayan, hareketYok };
  }, [rawData, settings]);

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

  // Settings Handlers (Firestore)
  const handleSaveStandardRooms = async () => {
    const rooms = standardRoomsInput.split(/[\n,]+/).map(r => r.trim()).filter(r => r !== '');
    const newSettings = { ...settings, standardRooms: rooms };
    
    try {
      await setDoc(doc(db, 'settings', 'hotel'), newSettings);
      showSuccess('Standart odalar kaydedildi!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/hotel');
    }
  };

  const handleAddRule = async () => {
    if (!newRuleMain.trim() || !newRuleInner.trim()) return;
    const innerRooms = newRuleInner.split(/[\n,]+/).map(r => r.trim()).filter(r => r !== '');
    
    const newRule: SplitRule = {
      id: Date.now().toString(),
      mainRoom: newRuleMain.trim(),
      innerRooms
    };
    
    const newSettings = { ...settings, splitRules: [...settings.splitRules, newRule] };
    
    try {
      await setDoc(doc(db, 'settings', 'hotel'), newSettings);
      setNewRuleMain('');
      setNewRuleInner('');
      showSuccess('Yeni kural eklendi!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/hotel');
    }
  };

  const handleDeleteRule = async (id: string) => {
    const newSettings = { ...settings, splitRules: settings.splitRules.filter(r => r.id !== id) };
    
    try {
      await setDoc(doc(db, 'settings', 'hotel'), newSettings);
      showSuccess('Kural silindi!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/hotel');
    }
  };

  const showSuccess = (msg: string) => {
    setSettingsSuccess(msg);
    setTimeout(() => setSettingsSuccess(''), 3000);
  };

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
        {error && activeTab !== 'ayarlar' && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-amber-800 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Bağlantı Hatası</p>
              <p className="mt-1 opacity-90">{error}</p>
              <p className="mt-2 text-xs font-semibold">Şu an test verisi (Mock Data) gösteriliyor.</p>
            </div>
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
          <div className="animate-in fade-in duration-300 space-y-6">
            
            {settingsSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 text-green-800 text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <p className="font-medium">{settingsSuccess}</p>
              </div>
            )}

            {settingsLoading ? (
              <div className="p-8 text-center text-gray-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 opacity-50" />
                <p>Ayarlar yükleniyor...</p>
              </div>
            ) : (
              <>
                {/* Standart Odalar */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="font-semibold text-gray-700">Standart Odalar</h2>
                    <p className="text-xs text-gray-500 mt-1">Tek kapılı normal odaları virgülle veya alt alta yazarak ekleyin.</p>
                  </div>
                  <div className="p-4">
                    <textarea
                      value={standardRoomsInput}
                      onChange={(e) => setStandardRoomsInput(e.target.value)}
                      className="w-full h-32 p-3 font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                      placeholder="1101, 1102, 1103..."
                      spellCheck="false"
                    />
                    <button
                      onClick={handleSaveStandardRooms}
                      className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Standart Odaları Kaydet
                    </button>
                  </div>
                </div>

                {/* Bölünebilir Oda Kuralları */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="font-semibold text-gray-700">Bölünebilir Oda Kuralları (Split Rooms)</h2>
                    <p className="text-xs text-gray-500 mt-1">Ana kapı numarasına yapılan rezervasyonları iç odalara ayırma kuralları.</p>
                  </div>
                  
                  <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Yeni Kural Ekle</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Ana Kapı Numarası (Main Room)</label>
                        <input
                          type="text"
                          value={newRuleMain}
                          onChange={(e) => setNewRuleMain(e.target.value)}
                          placeholder="Örn: 4402"
                          className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">İç Kapı Numaraları (Virgülle ayırın)</label>
                        <input
                          type="text"
                          value={newRuleInner}
                          onChange={(e) => setNewRuleInner(e.target.value)}
                          placeholder="Örn: 4402, 4502"
                          className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <button
                        onClick={handleAddRule}
                        className="w-full bg-gray-800 hover:bg-gray-900 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Kuralı Ekle
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Mevcut Kurallar</h3>
                    {settings.splitRules.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">Henüz kural eklenmemiş.</p>
                    ) : (
                      <ul className="space-y-2">
                        {settings.splitRules.map(rule => (
                          <li key={rule.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <div>
                              <span className="font-bold text-blue-700">{rule.mainRoom}</span>
                              <span className="mx-2 text-gray-400">→</span>
                              <span className="text-sm text-gray-600">{rule.innerRooms.join(', ')}</span>
                            </div>
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                              title="Kuralı Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
