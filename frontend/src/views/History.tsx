import React, { useEffect, useState, useMemo } from 'react';
import { NeoCard, NeoBadge, NeoButton } from '../components/NeoComponents';
import { ArrowUpRight, ArrowDownLeft, EyeOff, Lock, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useWalletRecords, RecordDonation } from '../hooks/useWalletRecords';
import { PROGRAM_ID } from '../deployed_program';
import { formatAddress, fieldToString } from '../utils/aleo';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';

const History: React.FC = () => {
  const { publicKey } = useWallet();
  const { fetchRecords, isLoading, hasPermission } = useWalletRecords();
  const [records, setRecords] = useState<RecordDonation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);

  const loadRecords = async () => {
    setRefreshing(true);
    console.log("[History] Loading records for:", publicKey);
    const data = await fetchRecords(PROGRAM_ID);
    console.log("[History] Loaded records:", data.length, data);
    setRecords(data);
    setRefreshing(false);
  };

  useEffect(() => {
    if (publicKey) {
        loadRecords();
    }
  }, [publicKey, fetchRecords]);

  // Calculate analytics
  const analyticsData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = days.map(day => ({ name: day, income: 0, expense: 0 }));
    
    records.forEach(record => {
        // Timestamp is in seconds, convert to milliseconds for Date
        const date = new Date(record.timestamp * 1000);
        const dayIndex = date.getDay();
        const amount = record.amount / 1_000_000; // Convert to credits
        
        if (record.sender) {
            // RecipientDonation (Incoming)
            data[dayIndex].income += amount;
        } else if (record.recipient) {
            // SentDonation (Outgoing)
            data[dayIndex].expense += amount;
        }
    });
    
    return data;
  }, [records]);

  const totalReceived = useMemo(() => {
     // Sum of received donations only
     return records.reduce((acc, curr) => {
         if (curr.sender) return acc + (curr.amount / 1_000_000);
         return acc;
     }, 0);
  }, [records]);

  // Separate sent and received transactions
  const sentTransactions = useMemo(() => {
    const sent = records.filter(record => {
      // SentDonation: has recipient, no sender, and owner matches current user
      const isSent = record.recipient && !record.sender;
      const isOwner = publicKey && record.owner?.toLowerCase() === publicKey.toLowerCase();
      return isSent && isOwner;
    });
    console.log("[History] Sent transactions:", sent.length, "out of", records.length, "total records");
    return sent.sort((a, b) => b.timestamp - a.timestamp);
  }, [records, publicKey]);

  const receivedTransactions = useMemo(() => {
    const received = records.filter(record => {
      // RecipientDonation: has sender, no recipient, and owner matches current user
      const isReceived = record.sender && !record.recipient;
      const isOwner = publicKey && record.owner?.toLowerCase() === publicKey.toLowerCase();
      return isReceived && isOwner;
    });
    console.log("[History] Received transactions:", received.length, "out of", records.length, "total records");
    return received.sort((a, b) => b.timestamp - a.timestamp);
  }, [records, publicKey]);

  if (!publicKey) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
              <h2 className="text-3xl font-black mb-4">Connect Wallet</h2>
              <p className="text-xl text-gray-600">Please connect your Aleo wallet to view history.</p>
          </div>
      );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
       <div className="flex justify-between items-center">
         <h1 className="text-5xl font-black">HISTORY & ANALYTICS</h1>
         <div className="flex items-center gap-4">
             <NeoButton onClick={loadRecords} disabled={isLoading || refreshing} size="sm">
                 {refreshing ? <Loader2 className="animate-spin" size={18}/> : <RefreshCw size={18}/>}
             </NeoButton>
             <div className="bg-tipzo-green border-2 border-black px-4 py-2 font-bold shadow-neo">
               Total Received: {totalReceived.toLocaleString()} ALEO
             </div>
         </div>
       </div>

       {hasPermission === false && (
           <div className="bg-yellow-100 border-2 border-yellow-500 p-4 rounded font-bold text-yellow-800">
               ⚠️ Please grant "OnChainHistory" permission in your wallet to view private records.
           </div>
       )}

       {/* Analytics Chart - Collapsible */}
       <NeoCard color="white" className="w-full flex flex-col">
         <button
           onClick={() => setChartExpanded(!chartExpanded)}
           className="flex items-center justify-between w-full text-left p-4 hover:bg-gray-50 transition-colors"
         >
           <h3 className="text-2xl font-bold flex items-center gap-2">
              <Lock size={24} /> 
              Weekly Activity (Private View)
           </h3>
           {chartExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
         </button>
         {chartExpanded && (
           <div className="h-[400px] w-full px-4 pb-4">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart
                 data={analyticsData}
                 margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
               >
                 <XAxis dataKey="name" tick={{fontFamily: 'Space Grotesk', fontWeight: 'bold'}} axisLine={{stroke: 'black', strokeWidth: 2}} tickLine={false} />
                 <YAxis tick={{fontFamily: 'Space Grotesk', fontWeight: 'bold'}} axisLine={{stroke: 'black', strokeWidth: 2}} tickLine={false} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: '#FDE68A', border: '2px solid black', boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)', borderRadius: 0 }}
                   itemStyle={{ fontFamily: 'Space Grotesk', fontWeight: 'bold' }}
                   cursor={{fill: '#f3f4f6'}}
                 />
                 <Bar dataKey="income" fill="#BBF7D0" stroke="black" strokeWidth={2} radius={[4, 4, 0, 0]} />
                 <Bar dataKey="expense" fill="#FDBA74" stroke="black" strokeWidth={2} radius={[4, 4, 0, 0]} />
               </BarChart>
             </ResponsiveContainer>
           </div>
         )}
       </NeoCard>

       {/* Transaction List - Separated by Sent/Received */}
       <div className="space-y-8">
          {/* Received Transactions */}
          <div>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <ArrowDownLeft size={24} className="text-green-600" />
              Received Donations ({receivedTransactions.length})
            </h3>
            {receivedTransactions.length === 0 && !isLoading && (
              <div className="text-center py-10 text-gray-500 font-bold bg-white border-2 border-black p-4">
                No received donations found.
              </div>
            )}
            <div className="space-y-4">
              {receivedTransactions.map((tx, idx) => {
                const dateStr = new Date(tx.timestamp * 1000).toLocaleDateString() + ' ' + new Date(tx.timestamp * 1000).toLocaleTimeString();
                const message = fieldToString(tx.message);

                return (
                  <div key={`received-${idx}`} className="bg-white border-2 border-black p-4 shadow-neo-sm flex flex-col md:flex-row items-center justify-between gap-4 transition-transform hover:translate-x-1">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="p-3 border-2 border-black bg-tipzo-green">
                        <ArrowDownLeft size={24} />
                      </div>
                      <div>
                        <div className="font-bold text-lg flex items-center gap-2">
                          Received from {formatAddress(tx.sender || "")}
                          <span title="Private Record"><EyeOff size={16} className="text-gray-500" /></span>
                        </div>
                        <div className="text-sm font-medium text-gray-500">{dateStr}</div>
                        {message && message !== "0field" && <div className="text-sm italic text-gray-600 mt-1">"{message}"</div>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                       <NeoBadge color="bg-gray-100">ZK-PROOF</NeoBadge>
                       <div className="text-2xl font-black text-green-600">
                          +{tx.amount / 1_000_000} ALEO
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sent Transactions */}
          <div>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <ArrowUpRight size={24} className="text-orange-600" />
              Sent Donations ({sentTransactions.length})
            </h3>
            {sentTransactions.length === 0 && !isLoading && (
              <div className="text-center py-10 text-gray-500 font-bold bg-white border-2 border-black p-4">
                No sent donations found.
              </div>
            )}
            <div className="space-y-4">
              {sentTransactions.map((tx, idx) => {
                const dateStr = new Date(tx.timestamp * 1000).toLocaleDateString() + ' ' + new Date(tx.timestamp * 1000).toLocaleTimeString();
                const message = fieldToString(tx.message);

                return (
                  <div key={`sent-${idx}`} className="bg-white border-2 border-black p-4 shadow-neo-sm flex flex-col md:flex-row items-center justify-between gap-4 transition-transform hover:translate-x-1">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="p-3 border-2 border-black bg-tipzo-orange">
                        <ArrowUpRight size={24} />
                      </div>
                      <div>
                        <div className="font-bold text-lg flex items-center gap-2">
                          Sent to {formatAddress(tx.recipient || "")}
                          <span title="Private Record"><EyeOff size={16} className="text-gray-500" /></span>
                        </div>
                        <div className="text-sm font-medium text-gray-500">{dateStr}</div>
                        {message && message !== "0field" && <div className="text-sm italic text-gray-600 mt-1">"{message}"</div>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                       <NeoBadge color="bg-gray-100">ZK-PROOF</NeoBadge>
                       <div className="text-2xl font-black text-red-500">
                          -{tx.amount / 1_000_000} ALEO
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {records.length === 0 && !isLoading && (
            <div className="text-center py-10 text-gray-500 font-bold">
              No donation records found. Make sure you have granted "OnChainHistory" permission in your wallet.
            </div>
          )}
       </div>
    </div>
  );
};

export default History;
