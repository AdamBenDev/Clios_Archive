'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import idlJson from '@/lib/idl/clios_archive.json';

const PROGRAM_ID = new PublicKey('411nw24abKMmqgmUXMeNgwuLytABW2HBZVR85rLGNKSY');

interface HistoricalRecord {
  publicKey: PublicKey;
  author: PublicKey;
  timestampUpload: number;
  timestampEvent: number;
  topic: string;
  description: string;
  category: string;
  sourceUrl: string;
}

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [mounted, setMounted] = useState(false);
  const [program, setProgram] = useState<Program | null>(null);
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Geopolitica');
  const [eventDate, setEventDate] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [status, setStatus] = useState('');
  
  const [records, setRecords] = useState<HistoricalRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<HistoricalRecord[]>([]);
  const [filterCategory, setFilterCategory] = useState('Tutti');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'write' | 'read'>('write');
  const [tipAmount, setTipAmount] = useState('0.1');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (wallet.publicKey && wallet.signTransaction) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = new AnchorProvider(connection, wallet as any, {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prog = new Program(idlJson as any, provider);
      setProgram(prog);
    }
  }, [wallet.publicKey, wallet.signTransaction, connection, wallet]);

  const loadRecords = useCallback(async () => {
    if (!program) {
      console.log('Program non pronto');
      return;
    }
    
    setLoading(true);
    try {
      console.log('Cercando account per:', PROGRAM_ID.toBase58());
      
      const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
      console.log('Tutti gli account trovati:', allAccounts.length);
      
      const loadedRecords: HistoricalRecord[] = [];
      const expectedDiscriminator = [113, 149, 127, 152, 8, 133, 183, 233];
      
      for (const account of allAccounts) {
        const data = account.account.data;
        const discriminator = Array.from(data.slice(0, 8));
        const isHistoricalRecord = discriminator.every((v, i) => v === expectedDiscriminator[i]);
        
        console.log('Account:', account.pubkey.toBase58(), 'Size:', data.length, 'IsRecord:', isHistoricalRecord);
        
        if (isHistoricalRecord && data.length === 522) {
          try {
            let offset = 8;
            
            const author = new PublicKey(data.slice(offset, offset + 32));
            offset += 32;
            
            const timestampUpload = Number(data.readBigInt64LE(offset));
            offset += 8;
            
            const timestampEvent = Number(data.readBigInt64LE(offset));
            offset += 8;
            
            const topicLen = data.readUInt32LE(offset);
            offset += 4;
            const topicVal = data.slice(offset, offset + topicLen).toString('utf8');
            offset += topicLen;
            
            const descLen = data.readUInt32LE(offset);
            offset += 4;
            const descriptionVal = data.slice(offset, offset + descLen).toString('utf8');
            offset += descLen;
            
            const catLen = data.readUInt32LE(offset);
            offset += 4;
            const categoryVal = data.slice(offset, offset + catLen).toString('utf8');
            offset += catLen;
            
            const urlLen = data.readUInt32LE(offset);
            offset += 4;
            const sourceUrlVal = data.slice(offset, offset + urlLen).toString('utf8');
            
            console.log('✅ Decoded:', topicVal);
            
            loadedRecords.push({
              publicKey: account.pubkey,
              author,
              timestampUpload,
              timestampEvent,
              topic: topicVal,
              description: descriptionVal,
              category: categoryVal,
              sourceUrl: sourceUrlVal,
            });
          } catch (e) {
            console.log('Errore decode manuale:', e);
          }
        }
      }
      
      console.log('Records caricati:', loadedRecords.length);
      setRecords(loadedRecords);
    } catch (error) {
      console.error('Errore caricamento:', error);
    }
    setLoading(false);
  }, [program, connection]);

  useEffect(() => {
    if (program) {
      loadRecords();
    }
  }, [program, loadRecords]);

  useEffect(() => {
    let filtered = [...records];
    
    if (filterCategory !== 'Tutti') {
      filtered = filtered.filter(r => r.category === filterCategory);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r => 
        r.topic.toLowerCase().includes(term) || 
        r.description.toLowerCase().includes(term)
      );
    }
    
    filtered.sort((a, b) => b.timestampUpload - a.timestampUpload);
    
    setFilteredRecords(filtered);
  }, [records, filterCategory, searchTerm]);

  const pubblicaFatto = async () => {
    if (!topic || !description || !eventDate) {
      setStatus('Compila tutti i campi richiesti.');
      return;
    }

    if (!program || !wallet.publicKey) {
      setStatus('Connetti il wallet prima!');
      return;
    }

    setStatus('Pubblicando...');

    try {
      const nuovaScheda = Keypair.generate();
      const eventTimestamp = new BN(Math.floor(new Date(eventDate).getTime() / 1000));

      await program.methods
        .aggiungiFatto(
          topic, 
          description, 
          category, 
          eventTimestamp,
          sourceUrl || ''
        )
        .accounts({
          record: nuovaScheda.publicKey,
          author: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([nuovaScheda])
        .rpc();

      setStatus('✅ Documento archiviato con successo!');
      setTopic('');
      setDescription('');
      setEventDate('');
      setSourceUrl('');
      
      await loadRecords();
    } catch (error: unknown) {
      console.error('Errore:', error);
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      setStatus(`❌ Errore: ${errorMessage}`);
    }
  };

  const sendTip = async (authorPubkey: PublicKey) => {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      setStatus('Connetti il wallet prima!');
      return;
    }

    try {
      const amount = parseFloat(tipAmount);
      if (isNaN(amount) || amount <= 0) {
        setStatus('Inserisci un importo valido');
        return;
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: authorPubkey,
          lamports: amount * LAMPORTS_PER_SOL,
        })
      );

      const signature = await wallet.sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      
      setStatus(`✅ Tip di ${amount} SOL inviato con successo!`);
    } catch (error: unknown) {
      console.error('Errore tip:', error);
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      setStatus(`❌ Errore: ${errorMessage}`);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const shortenAddress = (address: PublicKey) => {
    const str = address.toBase58();
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="absolute top-4 right-4">
        <WalletMultiButton />
      </div>

      <header className="text-center mb-10 pt-8">
        <h1 className="text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
          🏛️ Clio&apos;s Archive
        </h1>
        <p className="text-xl text-gray-400">Archivio Geopolitico Decentralizzato</p>
      </header>

      {/* Tab Navigation */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setActiveTab('write')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'write' 
                ? 'bg-purple-600 text-white' 
                : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
            }`}
          >
            ✍️ Scrivi
          </button>
          <button
            onClick={() => { setActiveTab('read'); loadRecords(); }}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'read' 
                ? 'bg-purple-600 text-white' 
                : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
            }`}
          >
            📜 Archivio ({records.length})
          </button>
        </div>
      </div>

      {/* Tab: Scrivi */}
      {activeTab === 'write' && (
        <div className="max-w-2xl mx-auto bg-slate-900 p-8 rounded-2xl border border-slate-800">
          <h2 className="text-2xl font-bold mb-6 border-b border-slate-700 pb-2">Nuovo Documento</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-gray-400 uppercase font-bold">Titolo</label>
              <input 
                type="text"
                className="w-full p-3 mt-1 rounded bg-slate-800 border border-slate-700 focus:border-purple-500 outline-none"
                placeholder="Es. Trattato di Versailles"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-400 uppercase font-bold">Categoria</label>
              <select 
                className="w-full p-3 mt-1 rounded bg-slate-800 border border-slate-700 focus:border-purple-500 outline-none"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>Geopolitica</option>
                <option>Guerra</option>
                <option>Economia</option>
                <option>Trattati</option>
                <option>Cultura</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-gray-400 uppercase font-bold">Data Evento</label>
              <input 
                type="date"
                className="w-full p-3 mt-1 rounded bg-slate-800 border border-slate-700 focus:border-purple-500 outline-none"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase font-bold">Fonte (URL)</label>
              <input 
                type="text"
                className="w-full p-3 mt-1 rounded bg-slate-800 border border-slate-700 focus:border-purple-500 outline-none"
                placeholder="https://..."
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="text-xs text-gray-400 uppercase font-bold">Descrizione</label>
            <textarea 
              className="w-full p-3 mt-1 rounded bg-slate-800 border border-slate-700 focus:border-purple-500 outline-none h-32"
              placeholder="Analisi storica..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <button 
            onClick={pubblicaFatto}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 rounded-xl transition-all"
          >
            ARCHIVIA PER SEMPRE
          </button>
          
          {status && <p className="mt-4 text-center text-yellow-400 font-bold">{status}</p>}
        </div>
      )}

      {/* Tab: Archivio */}
      {activeTab === 'read' && (
        <div className="max-w-4xl mx-auto">
          {/* Filtri */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-400 uppercase font-bold">Cerca</label>
                <input 
                  type="text"
                  className="w-full p-3 mt-1 rounded bg-slate-800 border border-slate-700 focus:border-purple-500 outline-none"
                  placeholder="Cerca per titolo o descrizione..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase font-bold">Categoria</label>
                <select 
                  className="w-full p-3 mt-1 rounded bg-slate-800 border border-slate-700 focus:border-purple-500 outline-none"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option>Tutti</option>
                  <option>Geopolitica</option>
                  <option>Guerra</option>
                  <option>Economia</option>
                  <option>Trattati</option>
                  <option>Cultura</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase font-bold">Importo Tip (SOL)</label>
                <input 
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="w-full p-3 mt-1 rounded bg-slate-800 border border-slate-700 focus:border-purple-500 outline-none"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Lista Documenti */}
          {loading ? (
            <div className="text-center py-10">
              <p className="text-gray-400 text-xl">⏳ Caricamento...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400 text-xl">📭 Nessun documento trovato</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecords.map((record) => (
                <div 
                  key={record.publicKey.toBase58()} 
                  className="bg-slate-900 p-6 rounded-2xl border border-slate-800 hover:border-purple-500 transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-xl font-bold text-purple-400">{record.topic}</h3>
                      <span className="inline-block px-3 py-1 bg-slate-800 rounded-full text-xs text-gray-300 mt-1">
                        {record.category}
                      </span>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      <p>📅 Evento: {formatDate(record.timestampEvent)}</p>
                      <p>🕐 Archiviato: {formatDate(record.timestampUpload)}</p>
                    </div>
                  </div>
                  
                  <p className="text-gray-300 mb-4">{record.description}</p>
                  
                  {record.sourceUrl && (
                    <a 
                      href={record.sourceUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline text-sm"
                    >
                      🔗 {record.sourceUrl}
                    </a>
                  )}
                  
                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-800">
                    <p className="text-sm text-gray-500">
                      ✍️ Autore: <span className="text-purple-400">{shortenAddress(record.author)}</span>
                    </p>
                    
                    {wallet.publicKey && (
                      <button
                        onClick={() => sendTip(record.author)}
                        className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 rounded-lg font-bold text-sm transition-all"
                      >
                        💰 Tip {tipAmount} SOL
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {status && <p className="mt-4 text-center text-yellow-400 font-bold">{status}</p>}
        </div>
      )}
    </main>
  );
}