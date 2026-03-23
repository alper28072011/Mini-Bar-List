import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  RefreshCw, AlertCircle, CheckCircle2, Save, Plus, Trash2, 
  LogIn, ArrowRight, BedDouble, ArrowLeft, LogOut, Minus,
  Search, LayoutGrid, Grid, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

type TabType = 'rack' | 'girisYapacak' | 'girisYapti' | 'cikisYapacak' | 'cikisYapti' | 'devamEden' | 'hareketYok' | 'ayarlar';
type GridViewType = 'spacious' | 'compact';

const TABS: { id: TabType; label: string }[] = [
  { id: 'rack', label: 'Rack Görünümü' },
  { id: 'girisYapacak', label: 'Giriş Yapacak' },
  { id: 'girisYapti', label: 'Giriş Yaptı' },
  { id: 'cikisYapacak', label: 'Çıkış Yapacak' },
  { id: 'cikisYapti', label: 'Çıkış Yaptı' },
  { id: 'devamEden', label: 'Devam Eden' },
  { id: 'hareketYok', label: 'Hareket Yok' },
  { id: 'ayarlar', label: '⚙️ Ayarlar' },
];

const getStatusStyles = (status: string) => {
  switch(status) {
    case 'devamEden': return { bg: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: BedDouble, label: 'Devam Eden' };
    case 'girisYapacak': return { bg: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: ArrowRight, label: 'Giriş Yapacak' };
    case 'girisYapti': return { bg: 'bg-green-100 text-green-700 border-green-200', icon: LogIn, label: 'Giriş Yaptı' };
    case 'cikisYapacak': return { bg: 'bg-red-100 text-red-700 border-red-200', icon: ArrowLeft, label: 'Çıkış Yapacak' };
    case 'cikisYapti': return { bg: 'bg-gray-200 text-gray-700 border-gray-300', icon: LogOut, label: 'Çıkış Yaptı' };
    case 'hareketYok': default: return { bg: 'bg-gray-50 text-gray-400 border-gray-100', icon: Minus, label: 'Hareket Yok' };
  }
};

export default function App() {
  // Persisted States
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return (localStorage.getItem('activeTab') as TabType) || 'rack';
  });
  const [gridView, setGridView] = useState<GridViewType>(() => {
    return (localStorage.getItem('gridView') as GridViewType) || 'spacious';
  });

  const tabsRef = useRef<HTMLDivElement>(null);

  // UI States
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [rackFilter, setRackFilter] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
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
    devamEden: Reservation[];
  }>({
    girisYapacak: [], girisYapti: [], cikisYapacak: [], cikisYapti: [], devamEden: []
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);

  // Save persisted states
  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);
  useEffect(() => { localStorage.setItem('gridView', gridView); }, [gridView]);

  // Auto-center active tab
  useEffect(() => {
    if (tabsRef.current) {
      const activeBtn = tabsRef.current.querySelector(`button[data-tab="${activeTab}"]`) as HTMLButtonElement;
      if (activeBtn) {
        const container = tabsRef.current;
        const scrollLeft = activeBtn.offsetLeft - (container.offsetWidth / 2) + (activeBtn.offsetWidth / 2);
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }, [activeTab]);

  // Load Settings from Firestore
  useEffect(() => {
    const docRef = doc(db, 'settings', 'hotel');
    
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as HotelSettings;
        setSettings(data);
        setStandardRoomsInput(data.standardRooms.join('\n'));
      } else {
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
    const devamEden = getPhysicalRooms(rawData.devamEden, settings);

    const totalPhysicalRooms = new Set<string>([...settings.standardRooms]);
    settings.splitRules.forEach(rule => {
      rule.innerRooms.forEach(r => totalPhysicalRooms.add(r));
    });

    const allActiveRooms = new Set([
      ...girisYapacak, ...girisYapti, ...cikisYapacak, ...cikisYapti, ...devamEden
    ]);
    
    const hareketYok = Array.from(totalPhysicalRooms)
      .filter(r => !allActiveRooms.has(r))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const roomStatusMap: Record<string, string> = {};
    
    Array.from(totalPhysicalRooms).forEach(room => {
      let status = 'hareketYok';
      if (girisYapti.includes(room)) status = 'girisYapti';
      else if (girisYapacak.includes(room)) status = 'girisYapacak';
      else if (devamEden.includes(room)) status = 'devamEden';
      else if (cikisYapacak.includes(room)) status = 'cikisYapacak';
      else if (cikisYapti.includes(room)) status = 'cikisYapti';
      
      roomStatusMap[room] = status;
    });

    const rackGroups: { type: 'standard' | 'split', mainRoom: string, rooms: { room: string, status: string }[] }[] = [];

    settings.standardRooms.forEach(room => {
      rackGroups.push({
        type: 'standard',
        mainRoom: room,
        rooms: [{ room, status: roomStatusMap[room] || 'hareketYok' }]
      });
    });

    settings.splitRules.forEach(rule => {
      rackGroups.push({
        type: 'split',
        mainRoom: rule.mainRoom,
        rooms: rule.innerRooms.map(r => ({ room: r, status: roomStatusMap[r] || 'hareketYok' }))
      });
    });

    rackGroups.sort((a, b) => a.mainRoom.localeCompare(b.mainRoom, undefined, { numeric: true }));

    return { girisYapacak, girisYapti, cikisYapacak, cikisYapti, devamEden, hareketYok, rackGroups };
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
        devamEden: [
          {"Column": "RESSTATEID", "Operator": "=", "Value": "3"},
          {"Column": "CHECKINDATE", "Operator": "<>", "Value": BUGUN},
          {"Column": "CHECKOUTDATE", "Operator": "<>", "Value": BUGUN}
        ]
      };

      const [resGirisYapacak, resGirisYapti, resCikisYapacak, resCikisYapti, resDevamEden] = await Promise.all([
        fetchHotelData(queries.girisYapacak, token, "Giriş Yapacak"),
        fetchHotelData(queries.girisYapti, token, "Giriş Yaptı"),
        fetchHotelData(queries.cikisYapacak, token, "Çıkış Yapacak"),
        fetchHotelData(queries.cikisYapti, token, "Çıkış Yaptı"),
        fetchHotelData(queries.devamEden, token, "Devam Eden"),
      ]);

      setRawData({
        girisYapacak: resGirisYapacak,
        girisYapti: resGirisYapti,
        cikisYapacak: resCikisYapacak,
        cikisYapti: resCikisYapti,
        devamEden: resDevamEden
      });
      setLastUpdated(new Date());
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Veri çekilirken bir hata oluştu.");
      setUsingMockData(true);
      setRawData({
        girisYapacak: MOCK_DATA.girisYapacak as Reservation[],
        girisYapti: MOCK_DATA.girisYapti as Reservation[],
        cikisYapacak: MOCK_DATA.cikisYapacak as Reservation[],
        cikisYapti: MOCK_DATA.cikisYapti as Reservation[],
        devamEden: MOCK_DATA.devamEden as Reservation[],
      });
      setLastUpdated(new Date());
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
    const newRule: SplitRule = { id: Date.now().toString(), mainRoom: newRuleMain.trim(), innerRooms };
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

  // Filtering Logic
  const currentList = (activeTab === 'ayarlar' || activeTab === 'rack') 
    ? [] 
    : processedData[activeTab as keyof typeof processedData] as string[];

  const filteredList = currentList.filter(room => room.toLowerCase().includes(searchQuery.toLowerCase()));

  const filteredRackGroups = processedData.rackGroups.map(group => {
    if (group.type === 'standard') {
      const room = group.rooms[0];
      const matchesSearch = room.room.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = rackFilter ? room.status === rackFilter : true;
      if (matchesSearch && matchesFilter) return group;
      return null;
    } else {
      const mainMatchesSearch = group.mainRoom.toLowerCase().includes(searchQuery.toLowerCase());
      const filteredRooms = group.rooms.filter(r => {
        const matchesSearch = mainMatchesSearch || r.room.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = rackFilter ? r.status === rackFilter : true;
        return matchesSearch && matchesFilter;
      });
      if (filteredRooms.length > 0) return { ...group, rooms: filteredRooms };
      return null;
    }
  }).filter(Boolean) as typeof processedData.rackGroups;

  const filteredTabGroups = useMemo(() => {
    if (activeTab === 'ayarlar' || activeTab === 'rack') return [];
    
    const groups: { type: 'standard' | 'split', mainRoom: string, rooms: { room: string, status: string }[] }[] = [];
    
    settings.standardRooms.forEach(room => {
      if (filteredList.includes(room)) {
        groups.push({ type: 'standard', mainRoom: room, rooms: [{ room, status: activeTab }] });
      }
    });

    settings.splitRules.forEach(rule => {
      const matchingInner = rule.innerRooms.filter(r => filteredList.includes(r));
      if (matchingInner.length > 0) {
        groups.push({
          type: 'split',
          mainRoom: rule.mainRoom,
          rooms: matchingInner.map(r => ({ room: r, status: activeTab }))
        });
      }
    });

    groups.sort((a, b) => a.mainRoom.localeCompare(b.mainRoom, undefined, { numeric: true }));
    return groups;
  }, [filteredList, activeTab, settings]);

  // Dynamic Grid Classes
  const gridContainerClass = gridView === 'spacious'
    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
    : "grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 gap-1.5";

  const standardCardClass = gridView === 'spacious'
    ? "p-3 rounded-xl border flex flex-col justify-center transition-all cursor-pointer shadow-sm"
    : "p-1.5 rounded-lg border flex flex-col justify-center transition-all cursor-pointer shadow-sm";

  const splitContainerClass = gridView === 'spacious'
    ? "col-span-2 sm:col-span-2 md:col-span-2 p-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-100/50 flex flex-col gap-2"
    : "col-span-2 sm:col-span-2 md:col-span-2 p-1.5 rounded-lg border-2 border-dashed border-gray-300 bg-gray-100/50 flex flex-col gap-1.5";

  const splitCardClass = gridView === 'spacious'
    ? "p-2 rounded-lg border flex flex-col justify-center transition-all cursor-pointer shadow-sm"
    : "p-1 rounded-md border flex flex-col justify-center transition-all cursor-pointer shadow-sm";

  const iconSizeClass = gridView === 'spacious' ? "w-5 h-5" : "w-3.5 h-3.5";
  const textSizeClass = gridView === 'spacious' ? "text-base" : "text-xs";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-30">
        <div className="max-w-xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Mini Bar List</h1>
            {lastUpdated && (
              <div className="flex items-center gap-1 text-xs text-blue-100 mt-0.5 opacity-90">
                <Clock className="w-3 h-3" />
                <span>Son Güncelleme: {lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
          </div>
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
      <div className="bg-white border-b border-gray-200 sticky top-[64px] z-20 shadow-sm">
        <div className="max-w-xl mx-auto">
          <div ref={tabsRef} className="flex overflow-x-auto hide-scrollbar px-2 py-1 scroll-smooth">
            {TABS.map(tab => (
              <button
                key={tab.id}
                data-tab={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchQuery('');
                  setSelectedRoom(null);
                }}
                className={`whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id 
                    ? 'text-blue-600 border-blue-600' 
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.id !== 'ayarlar' && tab.id !== 'rack' && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {(processedData[tab.id as keyof typeof processedData] as string[])?.length || 0}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar (Search & Grid Toggle) */}
      {activeTab !== 'ayarlar' && (
        <div className="bg-white border-b border-gray-100 sticky top-[113px] z-10 p-2 shadow-sm">
          <div className="max-w-xl mx-auto flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Oda Ara..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-100 border-transparent rounded-lg text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
              />
            </div>
            {activeTab === 'rack' && (
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => setGridView('compact')}
                  className={`p-1.5 rounded-md flex items-center gap-1 text-xs font-medium transition-colors ${gridView === 'compact' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Dar Görünüm"
                >
                  <Grid className="w-4 h-4" />
                  <span className="hidden sm:inline">Dar</span>
                </button>
                <button 
                  onClick={() => setGridView('spacious')}
                  className={`p-1.5 rounded-md flex items-center gap-1 text-xs font-medium transition-colors ${gridView === 'spacious' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Geniş Görünüm"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">Geniş</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 pb-20 overflow-hidden">
        
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

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="w-full"
          >
            {/* Dynamic Content Based on Tab */}
            {activeTab === 'rack' ? (
          <div className="animate-in fade-in duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-semibold text-gray-700 mb-3">Rack Görünümü</h2>
                
                {/* Clickable Legend / Filters */}
                <div className="flex flex-wrap gap-x-2 gap-y-2 text-xs">
                  {['girisYapacak', 'girisYapti', 'cikisYapacak', 'cikisYapti', 'devamEden', 'hareketYok'].map(status => {
                    const styles = getStatusStyles(status);
                    const Icon = styles.icon;
                    const isSelected = rackFilter === status;
                    const isFaded = rackFilter && rackFilter !== status;
                    
                    return (
                      <button 
                        key={status} 
                        onClick={() => setRackFilter(isSelected ? null : status)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all ${
                          isSelected ? 'ring-2 ring-offset-1 ring-blue-400 bg-white shadow-sm scale-105' : 'hover:bg-gray-100'
                        } ${isFaded ? 'opacity-40 grayscale' : 'opacity-100'}`}
                      >
                        <span className={`w-5 h-5 flex items-center justify-center rounded font-bold text-[10px] ${styles.bg}`}>
                          <Icon className="w-3 h-3" />
                        </span>
                        <span className="text-gray-700 font-medium">{styles.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {loading && filteredRackGroups.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 opacity-50" />
                  <p>Veriler yükleniyor...</p>
                </div>
              ) : filteredRackGroups.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>Arama veya filtreye uygun oda bulunamadı.</p>
                </div>
              ) : (
                <div className={`p-3 ${gridContainerClass}`}>
                  {filteredRackGroups.map(group => {
                    if (group.type === 'standard') {
                      const { room, status } = group.rooms[0];
                      const config = getStatusStyles(status);
                      const Icon = config.icon;
                      const isSelected = selectedRoom === room;
                      
                      return (
                        <div 
                          key={room} 
                          onClick={() => setSelectedRoom(isSelected ? null : room)}
                          className={`${standardCardClass} ${config.bg} ${isSelected ? 'ring-2 ring-offset-1 ring-blue-400 scale-105 z-10' : 'hover:scale-[1.02]'}`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <Icon className={`${iconSizeClass} opacity-80`} />
                            <span className={`font-mono font-bold tracking-tight ${textSizeClass}`}>{room}</span>
                          </div>
                          {isSelected && (
                            <div className="mt-2 text-[10px] sm:text-xs font-semibold text-center animate-in slide-in-from-top-1">
                              {config.label}
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      // Split room
                      return (
                        <div key={group.mainRoom} className={splitContainerClass}>
                          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-500 font-bold flex items-center gap-1">
                            <span>Ana Kapı:</span> <span className="text-gray-700">{group.mainRoom}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                            {group.rooms.map(({ room, status }) => {
                              const config = getStatusStyles(status);
                              const Icon = config.icon;
                              const isSelected = selectedRoom === room;
                              
                              return (
                                <div 
                                  key={room} 
                                  onClick={() => setSelectedRoom(isSelected ? null : room)}
                                  className={`${splitCardClass} ${config.bg} ${isSelected ? 'ring-2 ring-offset-1 ring-blue-400 scale-105 z-10' : 'hover:scale-[1.02]'}`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <Icon className={`${iconSizeClass} opacity-80`} />
                                    <span className={`font-mono font-bold tracking-tight ${textSizeClass}`}>{room}</span>
                                  </div>
                                  {isSelected && (
                                    <div className="mt-1.5 text-[9px] sm:text-[10px] leading-tight font-semibold text-center animate-in slide-in-from-top-1">
                                      {config.label}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </div>
          </div>
        ) : activeTab !== 'ayarlar' ? (
          <div className="animate-in fade-in duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h2 className="font-semibold text-gray-700">
                  {TABS.find(t => t.id === activeTab)?.label} Odaları
                </h2>
              </div>
              
              {loading && filteredList.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 opacity-50" />
                  <p>Veriler yükleniyor...</p>
                </div>
              ) : filteredList.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>Bu kategoride aranan oda bulunamadı.</p>
                </div>
              ) : (
                <div className={`p-3 ${gridContainerClass}`}>
                  {filteredTabGroups.map(group => {
                    if (group.type === 'standard') {
                      const { room, status } = group.rooms[0];
                      const config = getStatusStyles(status);
                      const Icon = config.icon;
                      const isSelected = selectedRoom === room;
                      
                      return (
                        <div 
                          key={room} 
                          onClick={() => setSelectedRoom(isSelected ? null : room)}
                          className={`${standardCardClass} ${config.bg} ${isSelected ? 'ring-2 ring-offset-1 ring-blue-400 scale-105 z-10' : 'hover:scale-[1.02]'}`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <Icon className={`${iconSizeClass} opacity-80`} />
                            <span className={`font-mono font-bold tracking-tight ${textSizeClass}`}>{room}</span>
                          </div>
                          {isSelected && (
                            <div className="mt-2 text-[10px] sm:text-xs font-semibold text-center animate-in slide-in-from-top-1">
                              {config.label}
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      // Split room
                      return (
                        <div key={group.mainRoom} className={splitContainerClass}>
                          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-500 font-bold flex items-center gap-1">
                            <span>Ana Kapı:</span> <span className="text-gray-700">{group.mainRoom}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                            {group.rooms.map(({ room, status }) => {
                              const config = getStatusStyles(status);
                              const Icon = config.icon;
                              const isSelected = selectedRoom === room;
                              
                              return (
                                <div 
                                  key={room} 
                                  onClick={() => setSelectedRoom(isSelected ? null : room)}
                                  className={`${splitCardClass} ${config.bg} ${isSelected ? 'ring-2 ring-offset-1 ring-blue-400 scale-105 z-10' : 'hover:scale-[1.02]'}`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <Icon className={`${iconSizeClass} opacity-80`} />
                                    <span className={`font-mono font-bold tracking-tight ${textSizeClass}`}>{room}</span>
                                  </div>
                                  {isSelected && (
                                    <div className="mt-1.5 text-[9px] sm:text-[10px] leading-tight font-semibold text-center animate-in slide-in-from-top-1">
                                      {config.label}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                  })}
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
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
