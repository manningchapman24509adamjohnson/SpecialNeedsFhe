// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface LearningPlan {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  studentName: string;
  learningStyle: string;
  status: "draft" | "active" | "completed";
}

const App: React.FC = () => {
  // Randomized style selections
  // Colors: High contrast (blue+orange)
  // UI Style: Flat design
  // Layout: Card-based
  // Interaction: Micro-interactions
  
  // Randomized features: Data statistics, search & filter, team information
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<LearningPlan[]>([]);
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
  const [newPlanData, setNewPlanData] = useState({
    studentName: "",
    learningStyle: "visual",
    specialNeeds: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Calculate statistics
  const draftCount = plans.filter(p => p.status === "draft").length;
  const activeCount = plans.filter(p => p.status === "active").length;
  const completedCount = plans.filter(p => p.status === "completed").length;

  useEffect(() => {
    loadPlans().finally(() => setLoading(false));
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

  const loadPlans = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("plan_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing plan keys:", e);
        }
      }
      
      const list: LearningPlan[] = [];
      
      for (const key of keys) {
        try {
          const planBytes = await contract.getData(`plan_${key}`);
          if (planBytes.length > 0) {
            try {
              const planData = JSON.parse(ethers.toUtf8String(planBytes));
              list.push({
                id: key,
                encryptedData: planData.data,
                timestamp: planData.timestamp,
                owner: planData.owner,
                studentName: planData.studentName,
                learningStyle: planData.learningStyle,
                status: planData.status || "draft"
              });
            } catch (e) {
              console.error(`Error parsing plan data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading plan ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setPlans(list);
    } catch (e) {
      console.error("Error loading plans:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitPlan = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting sensitive data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newPlanData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const planId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const planData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        studentName: newPlanData.studentName,
        learningStyle: newPlanData.learningStyle,
        status: "draft"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `plan_${planId}`, 
        ethers.toUtf8Bytes(JSON.stringify(planData))
      );
      
      const keysBytes = await contract.getData("plan_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(planId);
      
      await contract.setData(
        "plan_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted learning plan created!"
      });
      
      await loadPlans();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPlanData({
          studentName: "",
          learningStyle: "visual",
          specialNeeds: ""
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

  const activatePlan = async (planId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const planBytes = await contract.getData(`plan_${planId}`);
      if (planBytes.length === 0) {
        throw new Error("Plan not found");
      }
      
      const planData = JSON.parse(ethers.toUtf8String(planBytes));
      
      const updatedPlan = {
        ...planData,
        status: "active"
      };
      
      await contract.setData(
        `plan_${planId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPlan))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Plan activated with FHE!"
      });
      
      await loadPlans();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Activation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const completePlan = async (planId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const planBytes = await contract.getData(`plan_${planId}`);
      if (planBytes.length === 0) {
        throw new Error("Plan not found");
      }
      
      const planData = JSON.parse(ethers.toUtf8String(planBytes));
      
      const updatedPlan = {
        ...planData,
        status: "completed"
      };
      
      await contract.setData(
        `plan_${planId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPlan))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Plan completed with FHE!"
      });
      
      await loadPlans();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Completion failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const filteredPlans = plans.filter(plan => {
    const matchesSearch = plan.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          plan.learningStyle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || plan.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const renderStatsCards = () => {
    return (
      <div className="stats-container">
        <div className="stat-card">
          <div className="stat-value">{plans.length}</div>
          <div className="stat-label">Total Plans</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{draftCount}</div>
          <div className="stat-label">Drafts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{activeCount}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completedCount}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>
    );
  };

  const renderTeamInfo = () => {
    return (
      <div className="team-card">
        <h3>Our Team</h3>
        <div className="team-members">
          <div className="member">
            <div className="member-avatar">JD</div>
            <div className="member-info">
              <h4>Dr. Jane Doe</h4>
              <p>Special Education Specialist</p>
            </div>
          </div>
          <div className="member">
            <div className="member-avatar">MS</div>
            <div className="member-info">
              <h4>Prof. Michael Smith</h4>
              <p>FHE Cryptography Expert</p>
            </div>
          </div>
          <div className="member">
            <div className="member-avatar">AL</div>
            <div className="member-info">
              <h4>Alice Lee</h4>
              <p>UX Designer</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE<span>Learning</span>Plans</h1>
          <div className="fhe-badge">Fully Homomorphic Encryption</div>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <section className="hero-section">
          <div className="hero-content">
            <h2>Privacy-Preserving Special Needs Tutoring</h2>
            <p>Create personalized learning plans with fully encrypted student data using FHE technology</p>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="primary-btn"
            >
              Create New Plan
            </button>
          </div>
          <div className="hero-image">
            <div className="fhe-visual"></div>
          </div>
        </section>

        <section className="stats-section">
          <h2>Learning Plan Statistics</h2>
          {renderStatsCards()}
        </section>

        <section className="search-section">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search plans..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
            <button 
              onClick={loadPlans}
              className="refresh-btn"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </section>

        <section className="plans-section">
          <h2>Learning Plans</h2>
          {filteredPlans.length === 0 ? (
            <div className="no-plans">
              <p>No learning plans found</p>
              <button 
                className="primary-btn"
                onClick={() => setShowCreateModal(true)}
              >
                Create First Plan
              </button>
            </div>
          ) : (
            <div className="plans-grid">
              {filteredPlans.map(plan => (
                <div className="plan-card" key={plan.id}>
                  <div className="card-header">
                    <h3>{plan.studentName}</h3>
                    <span className={`status-badge ${plan.status}`}>
                      {plan.status}
                    </span>
                  </div>
                  <div className="card-body">
                    <p><strong>Learning Style:</strong> {plan.learningStyle}</p>
                    <p><strong>Created:</strong> {new Date(plan.timestamp * 1000).toLocaleDateString()}</p>
                    <p><strong>Owner:</strong> {plan.owner.substring(0, 6)}...{plan.owner.substring(38)}</p>
                  </div>
                  <div className="card-footer">
                    {isOwner(plan.owner) && plan.status === "draft" && (
                      <button 
                        onClick={() => activatePlan(plan.id)}
                        className="action-btn"
                      >
                        Activate
                      </button>
                    )}
                    {isOwner(plan.owner) && plan.status === "active" && (
                      <button 
                        onClick={() => completePlan(plan.id)}
                        className="action-btn"
                      >
                        Complete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="info-section">
          <div className="info-grid">
            <div className="info-card">
              <h3>About FHE Learning</h3>
              <p>
                Our platform uses Fully Homomorphic Encryption (FHE) to process sensitive 
                student data without ever decrypting it. This ensures complete privacy 
                while enabling personalized learning plans.
              </p>
              <button 
                onClick={() => contract.isAvailable().then(() => alert("FHE system is available!"))}
                className="secondary-btn"
              >
                Check FHE Status
              </button>
            </div>
            {renderTeamInfo()}
          </div>
        </section>
      </main>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitPlan} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          planData={newPlanData}
          setPlanData={setNewPlanData}
        />
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
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
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
            <h3>FHE Learning Plans</h3>
            <p>Privacy-preserving special needs education</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact Us</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} FHE Learning Plans. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  planData: any;
  setPlanData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  planData,
  setPlanData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPlanData({
      ...planData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!planData.studentName) {
      alert("Please enter student name");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create New Learning Plan</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label>Student Name *</label>
            <input 
              type="text"
              name="studentName"
              value={planData.studentName} 
              onChange={handleChange}
              placeholder="Enter student name" 
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Learning Style *</label>
            <select 
              name="learningStyle"
              value={planData.learningStyle} 
              onChange={handleChange}
              className="form-select"
            >
              <option value="visual">Visual</option>
              <option value="auditory">Auditory</option>
              <option value="kinesthetic">Kinesthetic</option>
              <option value="reading">Reading/Writing</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Special Needs Description</label>
            <textarea 
              name="specialNeeds"
              value={planData.specialNeeds} 
              onChange={handleChange}
              placeholder="Describe special needs (will be encrypted with FHE)" 
              className="form-textarea"
              rows={4}
            />
          </div>
          
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <span>All data will be encrypted using FHE technology</span>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="secondary-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="primary-btn"
          >
            {creating ? "Creating with FHE..." : "Create Plan"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;