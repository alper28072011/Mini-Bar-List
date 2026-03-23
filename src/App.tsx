import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, Settings, ListTodo, Save } from 'lucide-react';
import { fetchReservations, getPhysicalRooms, MOCK_RESERVATIONS, Reservation, RoomSplitRule } from './services/api';

const DEFAULT_RULES: RoomSplitRule[] = [
  { baseRoom: "2507", targetRooms: ["2507", "2607"] },
  { baseRoom: "4401", targetRooms: ["4401", "4500", "4501"] },
  { baseRoom: "5211", targetRooms: ["5211", "5213"] }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'arrivals' | 'settings'>('arrivals');
  
  // Rules State
  const [rules, setRules] = useState<RoomSplitRule[]>(() => {
    const saved = localStorage.getItem('roomSplitRules');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Kayıtlı kurallar okunamadı", e);
      }
    }
    return DEFAULT_RULES;
  });
  
  const [rulesInput, setRulesInput] = useState(JSON.stringify(rules, null, 2));
  const [rulesError, setRulesError] = useState('');
  const [rulesSuccess, setRulesSuccess] = useState(false);

  // Data State
  const [rawReservations, setRawReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);

  // Processed Rooms (Derived state - automatically recalculates when rawReservations or rules change)
  const rooms = useMemo(() => {
    return getPhysicalRooms(rawReservations, rules);
  }, [rawReservations, rules]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setUsingMockData(false);

    try {
      const token = import.meta.env.VITE_HOTEL_API_TOKEN;
      
      if (!token || token === 'YOUR_BEARER_TOKEN_HERE') {
        throw new Error("API Token bulunamadı. Lütfen .env dosyasındaki VITE_HOTEL_API_TOKEN değerini güncelleyin.");
      }

      const data = await fetchReservations(token);
      setRawReservations(data);
      
      console.log("Ham Veri:", data);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Veri çekilirken bir hata oluştu.");
      
      // Hata durumunda veya token yoksa mock veriyi kullan (geliştirme kolaylığı için)
      console.log("Mock veri kullanılıyor...");
      setUsingMockData(true);
      setRawReservations(MOCK_RESERVATIONS);
    } finally {
      setLoading(false);
    }
  };

  // Sayfa yüklendiğinde otomatik veri çekmeyi dene
  useEffect(() => {
    loadData();
  }, []);

  const handleSaveRules = () => {
    try {
      const parsed = JSON.parse(rulesInput);
      if (!Array.isArray(parsed)) throw new Error("Kurallar bir dizi (array) olmalıdır.");
      
      // Basit bir yapı doğrulaması
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-20">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight">Mini Bar List</h1>
          {activeTab === 'arrivals' && (
            <button 
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
              aria-label="Yenile"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-[60px] z-10 shadow-sm">
        <div className="max-w-md mx-auto flex">
          <button
            onClick={() => setActiveTab('arrivals')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'arrivals' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <ListTodo className="w-4 h-4" />
            Giriş Yapacaklar
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'settings' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings className="w-4 h-4" />
            Ayarlar
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 pb-20">
        
        {activeTab === 'arrivals' && (
          <div className="animate-in fade-in duration-300">
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
                        <li><strong>VITE_HOTEL_API_TOKEN</strong> değerini yeni token ile güncelleyin.</li>
                      </ol>
                    </div>
                  )}
                  <p className="mt-2 text-xs font-semibold">Şu an test verisi (Mock Data) gösteriliyor.</p>
                </div>
              </div>
            )}

            {!error && !loading && rawReservations.length > 0 && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 text-green-800 text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <p className="font-medium">Canlı veri başarıyla çekildi.</p>
              </div>
            )}

            {/* Room List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h2 className="font-semibold text-gray-700">Fiziksel Odalar</h2>
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full">
                  {rooms.length} Oda
                </span>
              </div>
              
              {loading && rawReservations.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 opacity-50" />
                  <p>Odalar yükleniyor...</p>
                </div>
              ) : rooms.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>Gösterilecek oda bulunamadı.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {rooms.map((room, index) => (
                    <li key={index} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                      <span className="font-mono text-lg font-medium text-gray-800">{room}</span>
                      <span className="text-xs text-gray-400">Oda</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Debug Info (Optional, for development) */}
            <div className="mt-8">
              <details className="text-xs text-gray-500 bg-gray-100 p-3 rounded-lg">
                <summary className="font-semibold cursor-pointer outline-none">Geliştirici: Ham Veriyi Gör</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(rawReservations, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-in fade-in duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-semibold text-gray-700">Dinamik Kural Motoru</h2>
                <p className="text-xs text-gray-500 mt-1">Bölünebilir odaların kurallarını JSON formatında düzenleyin. Değişiklikler anında listeye yansır.</p>
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
