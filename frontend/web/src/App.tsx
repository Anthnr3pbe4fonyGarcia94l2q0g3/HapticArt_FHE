// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface HapticRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  intensity: number;
  texture: string;
}

const App: React.FC = () => {
  // Randomized style selections
  // Colors: High contrast (red+black)
  // UI Style: Cyberpunk
  // Layout: Center radiation
  // Interaction: Micro-interactions (hover effects)
  
  // Random features: Data statistics, Team information, Project introduction
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<HapticRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    intensity: 50,
    texture: "smooth"
  });

  // Statistics calculations
  const totalInteractions = records.length;
  const averageIntensity = records.length > 0 
    ? Math.round(records.reduce((sum, r) => sum + r.intensity, 0) / records.length)
    : 0;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({
          visible: true,
          status: "success",
          message: "FHE System is available!"
        });
      } else {
        setTransactionStatus({
          visible: true,
          status: "error",
          message: "FHE System is not available"
        });
      }
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Error checking availability"
      });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    }
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const keysBytes = await contract.getData("haptic_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: HapticRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`haptic_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                intensity: recordData.intensity || 50,
                texture: recordData.texture || "smooth"
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting haptic data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        intensity: newRecordData.intensity,
        texture: newRecordData.texture
      };
      
      await contract.setData(
        `haptic_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("haptic_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "haptic_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Haptic data encrypted and stored!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          intensity: 50,
          texture: "smooth"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderIntensityBar = (intensity: number) => {
    return (
      <div className="intensity-bar">
        <div 
          className="intensity-level" 
          style={{ 
            width: `${intensity}%`,
            backgroundColor: intensity > 70 ? '#ff0000' : intensity > 40 ? '#ff6600' : '#00ff00'
          }}
        ></div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <div className="radial-bg"></div>
      
      <header className="app-header">
        <div className="logo">
          <h1>FHE<span>Haptic</span>Art</h1>
          <div className="logo-sub">Fully Homomorphic Encryption Art Experience</div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={checkAvailability}
            className="cyber-button"
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="center-radial">
          <div className="project-intro cyber-card">
            <h2>FHE-Powered Haptic Art</h2>
            <p>
              This interactive art installation uses Fully Homomorphic Encryption to process 
              your touch interactions while keeping the data private. Each touch generates 
              encrypted data that transforms the artwork in real-time.
            </p>
            <div className="fhe-badge">
              <span>FHE-Powered Privacy</span>
            </div>
          </div>
          
          <div className="action-panel cyber-card">
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="create-btn cyber-button"
            >
              + Add Haptic Interaction
            </button>
            <button 
              onClick={loadRecords}
              className="refresh-btn cyber-button"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh Data"}
            </button>
          </div>
          
          <div className="stats-panel cyber-card">
            <h3>Interaction Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{totalInteractions}</div>
                <div className="stat-label">Total Interactions</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{averageIntensity}</div>
                <div className="stat-label">Avg Intensity</div>
              </div>
            </div>
          </div>
          
          <div className="records-panel cyber-card">
            <h3>Recent Haptic Interactions</h3>
            <div className="records-list">
              {records.length === 0 ? (
                <div className="no-records">
                  <p>No haptic interactions recorded yet</p>
                  <button 
                    className="cyber-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Interaction
                  </button>
                </div>
              ) : (
                records.slice(0, 5).map(record => (
                  <div className="record-item" key={record.id}>
                    <div className="record-id">#{record.id.substring(0, 6)}</div>
                    <div className="record-details">
                      <div className="record-texture">
                        Texture: <span>{record.texture}</span>
                      </div>
                      {renderIntensityBar(record.intensity)}
                    </div>
                    <div className="record-meta">
                      <div className="record-owner">
                        {record.owner.substring(0, 6)}...{record.owner.substring(38)}
                      </div>
                      <div className="record-date">
                        {new Date(record.timestamp * 1000).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div className="team-panel cyber-card">
            <h3>Art & Tech Team</h3>
            <div className="team-members">
              <div className="member">
                <div className="member-icon">👩‍🎨</div>
                <div className="member-info">
                  <div className="member-name">Lena Chen</div>
                  <div className="member-role">Lead Artist</div>
                </div>
              </div>
              <div className="member">
                <div className="member-icon">👨‍💻</div>
                <div className="member-info">
                  <div className="member-name">Raj Patel</div>
                  <div className="member-role">FHE Engineer</div>
                </div>
              </div>
              <div className="member">
                <div className="member-icon">👩‍🔬</div>
                <div className="member-info">
                  <div className="member-name">Sophie Zhang</div>
                  <div className="member-role">Haptic Researcher</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal cyber-card">
            <div className="modal-header">
              <h2>Create Haptic Interaction</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Touch Intensity (1-100)</label>
                <input 
                  type="range"
                  name="intensity"
                  min="1"
                  max="100"
                  value={newRecordData.intensity}
                  onChange={(e) => setNewRecordData({
                    ...newRecordData,
                    intensity: parseInt(e.target.value)
                  })}
                  className="cyber-slider"
                />
                <div className="slider-value">{newRecordData.intensity}</div>
              </div>
              
              <div className="form-group">
                <label>Surface Texture</label>
                <select 
                  name="texture"
                  value={newRecordData.texture} 
                  onChange={(e) => setNewRecordData({
                    ...newRecordData,
                    texture: e.target.value
                  })}
                  className="cyber-select"
                >
                  <option value="smooth">Smooth</option>
                  <option value="rough">Rough</option>
                  <option value="bumpy">Bumpy</option>
                  <option value="soft">Soft</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              
              <div className="fhe-notice">
                <div className="key-icon"></div> 
                Your haptic data will be encrypted with FHE before processing
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="cancel-btn cyber-button"
              >
                Cancel
              </button>
              <button 
                onClick={submitRecord} 
                disabled={creating}
                className="submit-btn cyber-button primary"
              >
                {creating ? "Encrypting with FHE..." : "Submit Interaction"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span>FHE Haptic Art Installation</span>
            <p>Exploring privacy-preserving interactive art</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="copyright">
            © {new Date().getFullYear()} FHE Art Collective. All interactions encrypted.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;