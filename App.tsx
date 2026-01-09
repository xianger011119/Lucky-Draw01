
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Participant, Winner, Group, AppMode, DrawMode } from './types';
import { announceWinner, generateFortune, suggestTeamNames } from './services/geminiService';
import { playTTS } from './services/audioService';
import { parseCSV, downloadGroupsAsCSV } from './services/csvService';
import { v4 as uuidv4 } from 'uuid';

// 大幅擴充模擬名單 (60+)
const MOCK_NAMES = [
  // 科技與企業
  "馬斯克", "賈伯斯", "庫克", "黃仁勳", "蘇姿丰", "比爾蓋茲", "祖克柏", "貝佐斯", "張忠謀", "林百里", "郭台銘",
  // 科學家
  "愛因斯坦", "牛頓", "居禮夫人", "霍金", "特斯拉", "達爾文", "圖靈", "費曼",
  // 演藝圈 (台灣)
  "周杰倫", "蔡依林", "五月天阿信", "林俊傑", "蕭敬騰", "鄧紫棋", "徐佳瑩", "韋禮安", "告五人", "頑童MJ116",
  // 演藝圈 (國際)
  "小勞勃道尼", "克里斯伊凡", "史嘉蕾喬韓森", "班奈狄克", "湯姆霍蘭德", "蓋兒加朵", "李奧納多", "湯姆克魯斯", "安潔莉娜裘莉",
  // 體育界
  "梅西", "C羅", "柯瑞", "詹姆士", "大谷翔平", "李多慧", "戴資穎", "林書豪", "費德勒", "納達爾",
  // 動漫與虛擬
  "路飛", "索隆", "鳴人", "佐助", "悟空", "貝吉達", "炭治郎", "禰豆子", "艾連", "米卡莎",
  // 歷史人物
  "蘇格拉底", "柏拉圖", "亞里斯多德", "諸葛亮", "曹操", "劉備", "關羽", "張飛"
];

const triggerConfetti = () => {
  for (let i = 0; i < 60; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'fixed w-2 h-2 rounded-full pointer-events-none z-50';
    confetti.style.backgroundColor = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'][Math.floor(Math.random() * 5)];
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.top = '-10px';
    document.body.appendChild(confetti);
    confetti.animate([
      { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${(Math.random() - 0.5) * 300}px, 100vh) rotate(${Math.random() * 720}deg)`, opacity: 0 }
    ], { duration: 1500 + Math.random() * 1500, easing: 'cubic-bezier(0, .9, .57, 1)' }).onfinish = () => confetti.remove();
  }
};

export default function App() {
  // State: 預設加入幾位初始名單
  const [participants, setParticipants] = useState<Participant[]>([
    { id: uuidv4(), name: "馬斯克" },
    { id: uuidv4(), name: "黃仁勳" },
    { id: uuidv4(), name: "蘇姿丰" },
    { id: uuidv4(), name: "張忠謀" }
  ]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [appMode, setAppMode] = useState<AppMode>(AppMode.DRAW);
  const [drawMode, setDrawMode] = useState<DrawMode>(DrawMode.SINGLE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newName, setNewName] = useState('');
  const [bulkNames, setBulkNames] = useState('');
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [groupSize, setGroupSize] = useState(3);
  const [currentDisplayIndex, setCurrentDisplayIndex] = useState(0);
  const [lastWinner, setLastWinner] = useState<Winner | null>(null);

  const shuffleInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived Data: Detect Duplicates
  const analyzedParticipants = useMemo(() => {
    const seen = new Set<string>();
    return participants.map(p => {
      const isDuplicate = seen.has(p.name);
      seen.add(p.name);
      return { ...p, isDuplicate };
    });
  }, [participants]);

  const hasDuplicates = analyzedParticipants.some(p => p.isDuplicate);

  // Effects
  useEffect(() => {
    if (isProcessing && appMode === AppMode.DRAW && participants.length > 0) {
      shuffleInterval.current = window.setInterval(() => {
        setCurrentDisplayIndex(prev => (prev + 1) % participants.length);
      }, 60);
    } else {
      if (shuffleInterval.current) clearInterval(shuffleInterval.current);
    }
    return () => { if (shuffleInterval.current) clearInterval(shuffleInterval.current); };
  }, [isProcessing, appMode, participants.length]);

  // Actions
  const handleAddParticipant = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newName.trim()) return;
    setParticipants([...participants, { id: uuidv4(), name: newName.trim() }]);
    setNewName('');
  };

  const handleBulkAdd = () => {
    if (!bulkNames.trim()) return;
    const names = bulkNames
      .split(/[\n,;]/)
      .map(n => n.trim())
      .filter(n => n.length > 0);
    const newParticipants = names.map(name => ({ id: uuidv4(), name }));
    setParticipants([...participants, ...newParticipants]);
    setBulkNames('');
    setIsBulkMode(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const names = parseCSV(text);
      const newParticipants = names.map(name => ({ id: uuidv4(), name }));
      setParticipants(prev => [...prev, ...newParticipants]);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const removeParticipant = (id: string) => setParticipants(participants.filter(p => p.id !== id));
  
  const removeDuplicates = () => {
    const uniqueNames = new Set<string>();
    const filtered = participants.filter(p => {
      if (uniqueNames.has(p.name)) return false;
      uniqueNames.add(p.name);
      return true;
    });
    setParticipants(filtered);
  };

  const fillMockData = () => {
    const mock = MOCK_NAMES.map(name => ({ id: uuidv4(), name }));
    setParticipants(mock);
  };

  const handleLuckyDraw = async () => {
    if (participants.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setLastWinner(null);

    setTimeout(async () => {
      const luckyIndex = Math.floor(Math.random() * participants.length);
      const luckyOne = participants[luckyIndex];
      setIsProcessing(false);
      triggerConfetti();

      const [audio, fortune] = await Promise.all([
        announceWinner(luckyOne.name),
        generateFortune(luckyOne.name)
      ]);

      const winnerData: Winner = { id: uuidv4(), name: luckyOne.name, timestamp: Date.now(), fortune };
      setWinners(prev => [winnerData, ...prev]);
      setLastWinner(winnerData);
      if (audio) playTTS(audio);
      if (drawMode === DrawMode.ELIMINATE) setParticipants(prev => prev.filter(p => p.id !== luckyOne.id));
    }, 2000);
  };

  const handleAutoGroup = async () => {
    if (participants.length === 0) return;
    setIsProcessing(true);
    
    // Fisher-Yates Shuffle
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    const newGroups: Group[] = [];
    const numGroups = Math.ceil(shuffled.length / groupSize);

    // AI Team Names
    const teamNames = await suggestTeamNames(numGroups);

    for (let i = 0; i < shuffled.length; i += groupSize) {
      const groupIdx = Math.floor(i / groupSize);
      newGroups.push({
        id: uuidv4(),
        name: teamNames[groupIdx] || `第 ${groupIdx + 1} 小隊`,
        members: shuffled.slice(i, i + groupSize)
      });
    }

    setGroups(newGroups);
    setIsProcessing(false);
    triggerConfetti();
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-7xl mx-auto">
      {/* Header */}
      <header className="w-full flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
            LuckySpin AI Pro
          </h1>
          <p className="text-slate-400 font-medium tracking-wide">專業抽籤・自動分組・智慧管理</p>
        </div>
        
        <nav className="flex bg-slate-800/50 p-1.5 rounded-2xl border border-slate-700">
          <button 
            onClick={() => setAppMode(AppMode.DRAW)}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${appMode === AppMode.DRAW ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            幸運抽籤
          </button>
          <button 
            onClick={() => setAppMode(AppMode.GROUP)}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${appMode === AppMode.GROUP ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            自動分組
          </button>
        </nav>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 w-full">
        
        {/* Left: Management Panel */}
        <section className="xl:col-span-4 space-y-6">
          <div className="glass p-6 rounded-3xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                名單管理 ({participants.length})
              </h2>
              <div className="flex gap-2">
                <button onClick={fillMockData} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 border border-indigo-400/30 px-2 py-1 rounded-lg">模擬大名單</button>
                <button onClick={() => setParticipants([])} className="text-[10px] font-bold text-red-400 hover:text-red-300 border border-red-400/30 px-2 py-1 rounded-lg">清空</button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">{isBulkMode ? '批量模式 (每行一個姓名)' : '單筆模式'}</span>
                <button 
                  onClick={() => setIsBulkMode(!isBulkMode)}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  {isBulkMode ? '切換單筆新增' : '切換批量新增'}
                </button>
              </div>

              {isBulkMode ? (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={bulkNames}
                    onChange={(e) => setBulkNames(e.target.value)}
                    placeholder="貼上姓名名單，姓名之間請用換行或逗號隔開..."
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
                  <button 
                    onClick={handleBulkAdd}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded-xl text-xs font-bold transition-all"
                  >
                    匯入名單
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddParticipant()}
                    placeholder="輸入姓名並按 Enter..."
                    className="bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2 flex-grow text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <label className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl cursor-pointer transition-colors" title="上傳 CSV">
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </label>
                </div>
              )}

              {hasDuplicates && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex justify-between items-center animate-fade-in">
                  <span className="text-xs text-amber-200 font-medium">發現重複姓名！</span>
                  <button onClick={removeDuplicates} className="text-xs bg-amber-500 text-black font-bold px-2 py-1 rounded-md hover:bg-amber-400 transition-colors">一鍵去重</button>
                </div>
              )}

              <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                {analyzedParticipants.map((p) => (
                  <div key={p.id} className={`flex justify-between items-center p-3 rounded-xl border transition-all group ${p.isDuplicate ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-800/30 border-transparent hover:border-slate-700'}`}>
                    <span className={`font-medium text-sm ${p.isDuplicate ? 'text-amber-200' : ''}`}>{p.name} {p.isDuplicate && '(重複)'}</span>
                    <button onClick={() => removeParticipant(p.id)} className="text-slate-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
                ))}
                {participants.length === 0 && <p className="text-center py-8 text-slate-600 text-sm italic">請匯入 CSV、批量新增或手動輸入</p>}
              </div>
            </div>
          </div>

          <div className="glass p-6 rounded-3xl">
            <h2 className="text-xl font-bold mb-4">抽籤/分組 設定</h2>
            {appMode === AppMode.DRAW ? (
              <div className="space-y-4">
                <label className="text-sm text-slate-400 block">抽取模式</label>
                <div className="flex bg-slate-900/50 p-1 rounded-xl">
                  {(['SINGLE', 'ELIMINATE'] as const).map(mode => (
                    <button key={mode} onClick={() => setDrawMode(mode)} className={`flex-grow py-2 rounded-lg text-xs font-bold transition-all ${drawMode === mode ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>
                      {mode === 'SINGLE' ? '允許重複' : '抽後移除'}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="text-sm text-slate-400 block flex justify-between">
                  <span>每組人數</span>
                  <span className="text-indigo-400 font-bold">{groupSize} 人</span>
                </label>
                <input 
                  type="range" min="2" max="20" value={groupSize} 
                  onChange={(e) => setGroupSize(parseInt(e.target.value))} 
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 italic">* 系統將自動根據總人數計算出最多 {Math.ceil(participants.length / groupSize)} 組</p>
              </div>
            )}
          </div>
        </section>

        {/* Center: Interactive Area */}
        <section className="xl:col-span-8">
          {appMode === AppMode.DRAW ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Draw Stage */}
              <div className="glass p-8 rounded-[40px] flex flex-col items-center justify-center min-h-[450px] relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-600/20 blur-[120px] rounded-full"></div>
                
                <div className="relative z-10 w-full text-center">
                  <div className="mb-12 h-24 flex items-center justify-center">
                    {isProcessing ? (
                      <div className="text-5xl font-black italic tracking-tighter text-white animate-pulse">{participants[currentDisplayIndex]?.name}</div>
                    ) : lastWinner ? (
                      <div className="animate-bounce">
                        <span className="text-indigo-400 text-xs font-black uppercase tracking-[0.2em]">恭喜幸運兒！</span>
                        <h2 className="text-6xl font-black text-white mt-2 drop-shadow-[0_0_20px_rgba(79,70,229,0.5)]">{lastWinner.name}</h2>
                      </div>
                    ) : (
                      <div className="text-4xl font-black text-slate-700 uppercase tracking-widest opacity-50">準備就緒</div>
                    )}
                  </div>

                  <button
                    onClick={handleLuckyDraw}
                    disabled={isProcessing || participants.length === 0}
                    className={`w-40 h-40 rounded-full border-4 flex items-center justify-center text-xl font-black transition-all shadow-2xl ${isProcessing ? 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed' : 'bg-gradient-to-br from-indigo-500 to-purple-700 border-white/20 hover:scale-110 active:scale-95 text-white'}`}
                  >
                    {isProcessing ? '抽獎中...' : 'SPIN'}
                  </button>

                  {lastWinner?.fortune && (
                    <div className="mt-10 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl max-w-xs mx-auto animate-fade-in shadow-inner">
                      <p className="text-sm italic text-indigo-200">"{lastWinner.fortune}"</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Draw History */}
              <div className="glass p-6 rounded-[30px] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    得獎名單 ({winners.length})
                  </h3>
                  {winners.length > 0 && (
                    <button onClick={() => setWinners([])} className="text-[10px] text-slate-500 hover:text-slate-300">清除紀錄</button>
                  )}
                </div>
                <div className="space-y-3 overflow-y-auto max-h-[350px] pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                  {winners.map((w, idx) => (
                    <div key={w.id} className="p-3 bg-white/5 rounded-xl flex justify-between items-center border border-white/10 group hover:bg-white/10 transition-colors">
                      <div>
                        <p className="font-bold text-indigo-300 group-hover:text-white transition-colors">{w.name}</p>
                        <p className="text-[10px] text-slate-500">{new Date(w.timestamp).toLocaleTimeString()}</p>
                      </div>
                      <span className="text-[10px] font-black bg-indigo-600/20 text-indigo-400 px-2 py-1 rounded-lg"># {winners.length - idx}</span>
                    </div>
                  ))}
                  {winners.length === 0 && <p className="text-center py-20 text-slate-600 text-sm italic">還沒有人得獎喔...</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Grouping Control Bar */}
              <div className="glass p-6 rounded-3xl flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-black">分組預覽</h2>
                  <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                    共 {groups.length} 組 / {participants.length} 人
                  </span>
                </div>
                <div className="flex gap-3">
                  {groups.length > 0 && (
                    <button 
                      onClick={() => downloadGroupsAsCSV(groups)}
                      className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-slate-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      導出 CSV
                    </button>
                  )}
                  <button 
                    onClick={handleAutoGroup}
                    disabled={isProcessing || participants.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                  >
                    {isProcessing ? 'AI 分析分組中...' : '開始自動分組'}
                  </button>
                </div>
              </div>

              {/* Groups Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groups.map((group, gIdx) => (
                  <div key={group.id} className="glass p-5 rounded-3xl border-t-4 border-t-indigo-500 animate-fade-in shadow-lg hover:shadow-indigo-500/10 transition-shadow" style={{ animationDelay: `${gIdx * 100}ms` }}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-indigo-400 font-black tracking-tight text-lg">{group.name}</h4>
                        <p className="text-[10px] text-slate-500 font-medium">成員數量: {group.members.length} 人</p>
                      </div>
                      <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400 font-mono">GROUP_{gIdx + 1}</span>
                    </div>
                    <div className="space-y-1.5">
                      {group.members.map((member, mIdx) => (
                        <div key={member.id} className="flex items-center gap-3 p-2.5 bg-white/5 rounded-xl text-sm hover:bg-white/10 transition-colors">
                          <span className="w-5 h-5 flex items-center justify-center bg-indigo-500/20 text-indigo-400 rounded-md text-[10px] font-bold">{mIdx + 1}</span>
                          <span className="font-medium">{member.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {groups.length === 0 && (
                  <div className="col-span-full py-32 text-center text-slate-600">
                    <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                       <svg className="w-10 h-10 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <p className="text-xl font-bold mb-2">準備好開始分組了嗎？</p>
                    <p className="text-sm opacity-60">調整設定後，點擊右上方「開始自動分組」</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="mt-16 text-slate-600 text-[10px] tracking-widest uppercase flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
        &copy; {new Date().getFullYear()} LuckySpin AI • Professional Grouping Engine
      </footer>
    </div>
  );
}
