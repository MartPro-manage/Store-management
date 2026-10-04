import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc,
  deleteDoc,
  query, 
  where,
  getDocs,
  handleFirestoreError,
  OperationType,
  cleanFirestoreData
} from '../lib/firebase';
import { Store, UserAccount } from '../types';
import { cleanupExpiredReceipts } from '../lib/salesCleanup';
import { RealTimeDatabaseUsage } from './RealTimeDatabaseUsage';
import { safeStorage } from '../utils/safeStorage';
import { 
  Store as StoreIcon, 
  Plus, 
  UserCheck, 
  Calculator, 
  PackageCheck, 
  Eye, 
  EyeOff,
  ShieldCheck, 
  Building2, 
  UserPlus, 
  Trash2, 
  Key, 
  KeyRound,
  Power,
  Ban,
  CheckCircle, 
  AlertCircle,
  X,
  ChevronRight,
  ChevronDown,
  Info,
  Lock,
  User,
  Shield,
  Camera,
  Volume2,
  VolumeX,
  ToggleLeft,
  ToggleRight,
  Settings,
  Sliders,
  Sparkles,
  Database,
  Activity,
  Save,
  Check,
  ScanLine,
  Users,
  DollarSign,
  LogOut
} from 'lucide-react';

interface SuperAdminProps {
  onSelectStoreToManage?: (store: Store) => void;
  onLogout?: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminProps> = ({ onSelectStoreToManage, onLogout }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [activeTab, setActiveTab] = useState<'stores' | 'cash_counters' | 'product_registers' | 'price_checkers' | 'all_accounts' | 'settings' | 'database_usage'>('stores');

  // 8-Digit Safety PIN verification after login
  const [isPinVerified, setIsPinVerified] = useState(() => {
    return safeStorage.getSessionItem('super_admin_pin_verified') === 'true';
  });
  const [safetyPinInput, setSafetyPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const handleVerifySafetyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (safetyPinInput.trim() === '10092010') {
      safeStorage.setSessionItem('super_admin_pin_verified', 'true');
      setIsPinVerified(true);
      setPinError(null);
    } else {
      setPinError('Incorrect 8-digit Super Admin Safety Passkey. Access denied.');
    }
  };

  // Master SuperAdmin Account Settings
  const [masterAdminPassword, setMasterAdminPassword] = useState('');
  const [showMasterPassword, setShowMasterPassword] = useState(false);

  // Form states - Create Store or Regional Branch (Super Admin Exclusive)
  const [newStoreType, setNewStoreType] = useState<'main' | 'branch'>('main');
  const [parentStoreIdForBranch, setParentStoreIdForBranch] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchAdminSalary, setNewBranchAdminSalary] = useState('');
  const [newAdministrativeExpenses, setNewAdministrativeExpenses] = useState('');
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAdminUsername, setNewStoreAdminUsername] = useState('');
  const [newStoreAdminPassword, setNewStoreAdminPassword] = useState('');
  const [newStoreCameraScannerEnabled, setNewStoreCameraScannerEnabled] = useState(true);
  const [newStoreVoiceAnnouncementEnabled, setNewStoreVoiceAnnouncementEnabled] = useState(true);

  // Form states - Create Cash Counter
  const [selectedStoreIdForCounter, setSelectedStoreIdForCounter] = useState('');
  const [counterNumber, setCounterNumber] = useState('');
  const [counterName, setCounterName] = useState('');
  const [counterUsername, setCounterUsername] = useState('');
  const [counterPassword, setCounterPassword] = useState('');

  // Form states - Create Product Registrar
  const [selectedStoreIdForReg, setSelectedStoreIdForReg] = useState('');
  const [registrarName, setRegistrarName] = useState('');
  const [registrarUsername, setRegistrarUsername] = useState('');
  const [registrarPassword, setRegistrarPassword] = useState('');

  // Form states - Create Customer Price Checker Terminal
  const [selectedStoreIdForPriceChecker, setSelectedStoreIdForPriceChecker] = useState('');
  const [priceCheckerName, setPriceCheckerName] = useState('');
  const [priceCheckerUsername, setPriceCheckerUsername] = useState('');
  const [priceCheckerPassword, setPriceCheckerPassword] = useState('');

  // Drill-down hierarchy state
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);

  // Dedicated modal for creating a branch admin account directly from a clicked store
  const [createBranchModalStore, setCreateBranchModalStore] = useState<Store | null>(null);
  const [modalBranchName, setModalBranchName] = useState('');
  const [modalBranchCode, setModalBranchCode] = useState('');
  const [modalBranchAdminUsername, setModalBranchAdminUsername] = useState('');
  const [modalBranchAdminPassword, setModalBranchAdminPassword] = useState('');
  const [modalBranchAdminSalary, setModalBranchAdminSalary] = useState('');
  const [modalBranchAdminOverhead, setModalBranchAdminOverhead] = useState('');

  // Dedicated modal for creating further accounts for a specific branch
  const [createBranchAccountModal, setCreateBranchAccountModal] = useState<{
    branch: Store;
    accountType: 'cash_counter' | 'product_register' | 'price_checker' | 'staff';
  } | null>(null);
  const [modalAccountName, setModalAccountName] = useState('');
  const [modalAccountUsername, setModalAccountUsername] = useState('');
  const [modalAccountPassword, setModalAccountPassword] = useState('');
  const [modalAccountCounterNum, setModalAccountCounterNum] = useState('1');
  const [modalAccountSalary, setModalAccountSalary] = useState('');
  const [modalStaffRole, setModalStaffRole] = useState<'staff' | 'inventory_manager'>('staff');

  // Store Management Modals / Actions
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const [resetStoreModal, setResetStoreModal] = useState<Store | null>(null);
  const [newStorePassword, setNewStorePassword] = useState('');

  // Security Matrix "Further Details" Modal
  const [furtherDetailsStore, setFurtherDetailsStore] = useState<Store | null>(null);
  const [showPasswordStoreId, setShowPasswordStoreId] = useState<string | null>(null);
  const [showUserPasswordId, setShowUserPasswordId] = useState<string | null>(null);

  // Sub-account management inside Further Details
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [resetUserModal, setResetUserModal] = useState<UserAccount | null>(null);
  const [newUserPassword, setNewUserPassword] = useState('');

  // Notifications
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Subscribe to stores and users
  useEffect(() => {
    const unsubStores = onSnapshot(collection(db, 'stores'), (snapshot) => {
      const storeList: Store[] = [];
      snapshot.forEach((d) => storeList.push({ id: d.id, ...d.data() } as Store));
      setStores(storeList);
      if (storeList.length > 0) {
        if (!selectedStoreIdForCounter) setSelectedStoreIdForCounter(storeList[0].id);
        if (!selectedStoreIdForReg) setSelectedStoreIdForReg(storeList[0].id);
        if (!selectedStoreIdForPriceChecker) setSelectedStoreIdForPriceChecker(storeList[0].id);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'stores');
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userList: UserAccount[] = [];
      snapshot.forEach((d) => userList.push({ id: d.id, ...d.data() } as UserAccount));
      setUsers(userList);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users');
    });

    // Purge expired receipts older than 7 days across all stores
    cleanupExpiredReceipts();

    return () => {
      unsubStores();
      unsubUsers();
    };
  }, []);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  // Deduplicated users list
  const userMap = new Map<string, UserAccount>();
  (users || []).forEach((user) => {
    const key = (user.username || user.id).trim().toLowerCase();
    if (!userMap.has(key)) {
      userMap.set(key, user);
    }
  });
  const uniqueUsers: UserAccount[] = Array.from(userMap.values());

  // Helper to check username uniqueness
  const isUsernameTaken = (uname: string) => {
    if (!uname) return false;
    const clean = uname.trim().toLowerCase();
    return users.some(u => (u?.username || '').trim().toLowerCase() === clean);
  };

  // Handle Create Store or Regional Branch (Super Admin Exclusive)
  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    const storeName = newStoreName.trim();
    const adminUsername = newStoreAdminUsername.trim().toLowerCase();
    const adminPassword = newStoreAdminPassword.trim();

    if (!storeName || !adminUsername || !adminPassword) {
      showNotification('error', 'Please fill in all store creation fields.');
      return;
    }

    if (newStoreType === 'branch' && !parentStoreIdForBranch) {
      showNotification('error', 'Please select a parent supermarket store for this regional branch.');
      return;
    }

    if (isUsernameTaken(adminUsername)) {
      showNotification('error', `Username "${adminUsername}" is already in use by another account.`);
      return;
    }

    setLoading(true);
    try {
      const storeDocRef = doc(collection(db, 'stores'));
      const storeId = storeDocRef.id;

      if (newStoreType === 'branch') {
        const parentStore = stores.find(s => s.id === parentStoreIdForBranch);
        const bSalary = Number(newBranchAdminSalary) || 0;
        const adminExp = Number(newAdministrativeExpenses) || 0;
        const bCode = newBranchCode.trim() || `BR-0${stores.filter(s => s.parentStoreId === parentStoreIdForBranch).length + 1}`;

        const newBranchData: Store = {
          id: storeId,
          name: storeName,
          isBranch: true,
          parentStoreId: parentStore?.id,
          storeAdminUsername: parentStore?.storeAdminUsername || parentStore?.adminUsername || adminUsername,
          adminUsername: adminUsername,
          adminPassword: adminPassword,
          branchCode: bCode,
          branchAdminUsername: adminUsername,
          branchAdminName: `${storeName} Branch Manager`,
          branchAdminSalary: bSalary,
          administrativeExpenses: adminExp,
          status: 'active',
          currencySymbol: parentStore?.currencySymbol || 'Rs.',
          receiptHeader: parentStore?.receiptHeader || `${storeName} - Official Receipt`,
          receiptFooter: parentStore?.receiptFooter || 'Thank you for shopping with us!',
          receiptFormat: parentStore?.receiptFormat || 'standard',
          cameraScannerEnabled: newStoreCameraScannerEnabled,
          voiceAnnouncementEnabled: newStoreVoiceAnnouncementEnabled,
          createdAt: new Date().toISOString()
        };
        await setDoc(storeDocRef, cleanFirestoreData(newBranchData));

        const userDocRef = doc(collection(db, 'users'));
        const newBranchAdminUser: UserAccount = {
          id: userDocRef.id,
          storeId: storeId,
          storeName: storeName,
          parentStoreId: parentStore?.id,
          role: 'branch_admin',
          username: adminUsername,
          password: adminPassword,
          name: `${storeName} Branch Manager`,
          salary: bSalary,
          salaryFrequency: 'monthly',
          createdAt: new Date().toISOString()
        };
        await setDoc(userDocRef, cleanFirestoreData(newBranchAdminUser));

        showNotification('success', `Regional Branch "${storeName}" (${bCode}) created under "${parentStore?.name || 'Main Store'}" with Branch Admin @${adminUsername}!`);
      } else {
        const newStoreData: Store = {
          id: storeId,
          name: storeName,
          adminUsername: adminUsername,
          storeAdminUsername: adminUsername,
          adminPassword: adminPassword,
          status: 'active',
          cameraScannerEnabled: newStoreCameraScannerEnabled,
          voiceAnnouncementEnabled: newStoreVoiceAnnouncementEnabled,
          createdAt: new Date().toISOString()
        };
        await setDoc(storeDocRef, cleanFirestoreData(newStoreData));

        const userDocRef = doc(collection(db, 'users'));
        const newStoreAdminUser: UserAccount = {
          id: userDocRef.id,
          storeId: storeId,
          storeName: storeName,
          role: 'store_admin',
          username: adminUsername,
          password: adminPassword,
          name: `${storeName} Store Admin`,
          createdAt: new Date().toISOString()
        };
        await setDoc(userDocRef, cleanFirestoreData(newStoreAdminUser));

        showNotification('success', `Supermarket Store "${storeName}" and Store Admin Account created successfully!`);
      }

      setNewStoreName('');
      setNewStoreAdminUsername('');
      setNewStoreAdminPassword('');
      setNewBranchCode('');
      setNewBranchAdminSalary('');
      setNewAdministrativeExpenses('');
      setNewStoreCameraScannerEnabled(true);
      setNewStoreVoiceAnnouncementEnabled(true);
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to create store: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle Inbuilt Camera Scanner per Store (Super Admin Exclusive)
  const handleToggleCameraScanner = async (store: Store) => {
    setLoading(true);
    try {
      const currentVal = store.cameraScannerEnabled !== false;
      const nextVal = !currentVal;
      const storeRef = doc(db, 'stores', store.id);
      await updateDoc(storeRef, { cameraScannerEnabled: nextVal });

      showNotification(
        'success',
        `Inbuilt Camera Barcode Scanner ${nextVal ? 'ENABLED' : 'DISABLED'} for store "${store.name}".`
      );

      // Also update local modal state if open
      if (furtherDetailsStore && furtherDetailsStore.id === store.id) {
        setFurtherDetailsStore({ ...furtherDetailsStore, cameraScannerEnabled: nextVal });
      }
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to toggle camera scanner setting: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle Checkout Voice Announcement & Audio Generation per Store (Super Admin Exclusive)
  const handleToggleVoiceAnnouncement = async (store: Store) => {
    setLoading(true);
    try {
      const currentVal = store.voiceAnnouncementEnabled !== false;
      const nextVal = !currentVal;
      const storeRef = doc(db, 'stores', store.id);
      await updateDoc(storeRef, { voiceAnnouncementEnabled: nextVal });

      showNotification(
        'success',
        `Voice Generation & Audio Announcements ${nextVal ? 'ALLOWED & ENABLED' : 'DISALLOWED & MUTED'} for store "${store.name}".`
      );

      // Also update local modal state if open
      if (furtherDetailsStore && furtherDetailsStore.id === store.id) {
        setFurtherDetailsStore({ ...furtherDetailsStore, voiceAnnouncementEnabled: nextVal });
      }
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to toggle voice generation permission: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle Store Active / Disabled Status
  const handleToggleStoreStatus = async (store: Store) => {
    setLoading(true);
    try {
      const newStatus = store.status === 'disabled' ? 'active' : 'disabled';
      const storeRef = doc(db, 'stores', store.id);
      await updateDoc(storeRef, { status: newStatus });

      showNotification(
        'success', 
        `Store "${store.name}" is now ${newStatus.toUpperCase()}.${newStatus === 'disabled' ? ' Login access for this store is blocked.' : ''}`
      );
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to update store status: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Confirm Delete Store
  const confirmDeleteStore = async () => {
    if (!storeToDelete) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'stores', storeToDelete.id));

      const associatedUsers = users.filter(u => u.storeId === storeToDelete.id);
      for (const u of associatedUsers) {
        await deleteDoc(doc(db, 'users', u.id));
      }

      showNotification('success', `Store "${storeToDelete.name}" and associated sub-accounts were permanently deleted.`);
      setStoreToDelete(null);
      if (furtherDetailsStore?.id === storeToDelete.id) {
        setFurtherDetailsStore(null);
      }
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to delete store: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Reset Store Password
  const handleResetStorePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetStoreModal) return;

    const pass = newStorePassword.trim();
    if (!pass) {
      showNotification('error', 'Password cannot be empty.');
      return;
    }

    setLoading(true);
    try {
      const storeRef = doc(db, 'stores', resetStoreModal.id);
      await updateDoc(storeRef, { adminPassword: pass });

      const adminUser = users.find(u => u.storeId === resetStoreModal.id && u.role === 'admin');
      if (adminUser) {
        await updateDoc(doc(db, 'users', adminUser.id), { password: pass });
      }

      showNotification('success', `Password for store "${resetStoreModal.name}" admin updated successfully!`);
      setResetStoreModal(null);
      setNewStorePassword('');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to update password: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 1. Direct Modal Handler: Create Branch Admin Account under a clicked Main Store
  const handleModalCreateBranchAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createBranchModalStore) return;

    const bName = modalBranchName.trim();
    const bCode = modalBranchCode.trim();
    const username = modalBranchAdminUsername.trim().toLowerCase();
    const password = modalBranchAdminPassword.trim();
    const bSalary = Number(modalBranchAdminSalary) || 0;
    const adminExp = Number(modalBranchAdminOverhead) || 0;

    if (!bName || !username || !password) {
      showNotification('error', 'Please provide branch name, branch admin username, and password.');
      return;
    }

    setLoading(true);
    try {
      // Check username uniqueness
      const existingUserQuery = query(collection(db, 'users'), where('username', '==', username));
      const userSnap = await getDocs(existingUserQuery);
      if (!userSnap.empty) {
        showNotification('error', `Username "${username}" is already taken.`);
        setLoading(false);
        return;
      }

      const branchRef = doc(collection(db, 'stores'));
      const branchId = branchRef.id;

      const newBranchStore: Store = {
        id: branchId,
        name: bName,
        adminUsername: username,
        adminPassword: password,
        status: 'active',
        isBranch: true,
        parentStoreId: createBranchModalStore.id,
        branchCode: bCode || undefined,
        branchAdminUsername: username,
        branchAdminSalary: bSalary,
        administrativeExpenses: adminExp,
        cameraScannerEnabled: true,
        voiceAnnouncementEnabled: true,
        receiptHeader: createBranchModalStore.receiptHeader || `${bName}\nTax Invoice`,
        receiptFooter: createBranchModalStore.receiptFooter || 'Thank you for shopping with us!',
        createdAt: new Date().toISOString()
      };
      await setDoc(branchRef, cleanFirestoreData(newBranchStore));

      // Create branch admin user account
      const userRef = doc(collection(db, 'users'));
      const branchAdminAccount: UserAccount = {
        id: userRef.id,
        storeId: branchId,
        parentStoreId: createBranchModalStore.id,
        storeName: bName,
        role: 'branch_admin',
        username,
        password,
        name: `${bName} Admin`,
        salary: bSalary,
        salaryFrequency: 'monthly',
        createdAt: new Date().toISOString()
      };
      await setDoc(userRef, cleanFirestoreData(branchAdminAccount));

      showNotification('success', `Branch "${bName}" & Branch Admin @${username} created under ${createBranchModalStore.name}!`);
      // Auto expand parent store and newly created branch
      setExpandedStoreId(createBranchModalStore.id);
      setExpandedBranchId(branchId);

      setCreateBranchModalStore(null);
      setModalBranchName('');
      setModalBranchCode('');
      setModalBranchAdminUsername('');
      setModalBranchAdminPassword('');
      setModalBranchAdminSalary('');
      setModalBranchAdminOverhead('');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to create branch admin account: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Direct Modal Handler: Create Further Sub-Accounts for a clicked Branch
  const handleModalCreateBranchSubAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createBranchAccountModal) return;

    const { branch, accountType } = createBranchAccountModal;
    const name = modalAccountName.trim();
    const username = modalAccountUsername.trim().toLowerCase();
    const password = modalAccountPassword.trim();
    const salary = Number(modalAccountSalary) || 0;
    const counterNum = modalAccountCounterNum.trim();
    const assignedRole = accountType === 'staff' ? modalStaffRole : accountType;

    if (!name || !username || !password) {
      showNotification('error', 'Please fill in account name, username, and password.');
      return;
    }

    setLoading(true);
    try {
      const existingUserQuery = query(collection(db, 'users'), where('username', '==', username));
      const userSnap = await getDocs(existingUserQuery);
      if (!userSnap.empty) {
        showNotification('error', `Username "${username}" is already taken.`);
        setLoading(false);
        return;
      }

      const userDocRef = doc(collection(db, 'users'));
      const newAccount: UserAccount = {
        id: userDocRef.id,
        storeId: branch.id,
        parentStoreId: branch.parentStoreId || branch.id,
        storeName: branch.name,
        role: assignedRole,
        username,
        password,
        name,
        counterNumber: accountType === 'cash_counter' ? (counterNum || '1') : undefined,
        salary: salary > 0 ? salary : undefined,
        salaryFrequency: salary > 0 ? 'monthly' : undefined,
        createdAt: new Date().toISOString()
      };

      await setDoc(userDocRef, cleanFirestoreData(newAccount));

      showNotification('success', `${assignedRole.replace('_', ' ').toUpperCase()} account @${username} created for branch "${branch.name}"!`);
      setCreateBranchAccountModal(null);
      setModalAccountName('');
      setModalAccountUsername('');
      setModalAccountPassword('');
      setModalAccountCounterNum('1');
      setModalAccountSalary('');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to create account: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Create Cash Counter
  const handleCreateCashCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!selectedStoreIdForCounter) {
      showNotification('error', 'Please create or select a store first.');
      return;
    }

    const cNum = counterNumber.trim();
    const cName = counterName.trim();
    const uName = counterUsername.trim().toLowerCase();
    const pWord = counterPassword.trim();

    if (!cNum || !cName || !uName || !pWord) {
      showNotification('error', 'All fields are required to create a cash counter.');
      return;
    }

    if (isUsernameTaken(uName)) {
      showNotification('error', `Username "${uName}" is already taken.`);
      return;
    }

    const targetStore = stores.find(s => s.id === selectedStoreIdForCounter);

    setLoading(true);
    try {
      const userDocRef = doc(collection(db, 'users'));
      const cashCounterAccount: UserAccount = {
        id: userDocRef.id,
        storeId: selectedStoreIdForCounter,
        storeName: targetStore?.name || 'Store',
        role: 'cash_counter',
        counterNumber: cNum,
        name: cName,
        username: uName,
        password: pWord,
        createdAt: new Date().toISOString()
      };

      await setDoc(userDocRef, cleanFirestoreData(cashCounterAccount));
      showNotification('success', `Cash Counter #${cNum} ("${cName}") account added successfully!`);
      setCounterNumber('');
      setCounterName('');
      setCounterUsername('');
      setCounterPassword('');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to add cash counter: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Create Product Registrar
  const handleCreateProductRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!selectedStoreIdForReg) {
      showNotification('error', 'Please create or select a store first.');
      return;
    }

    const rName = registrarName.trim();
    const uName = registrarUsername.trim().toLowerCase();
    const pWord = registrarPassword.trim();

    if (!rName || !uName || !pWord) {
      showNotification('error', 'All fields are required to create a product register user.');
      return;
    }

    if (isUsernameTaken(uName)) {
      showNotification('error', `Username "${uName}" is already taken.`);
      return;
    }

    const targetStore = stores.find(s => s.id === selectedStoreIdForReg);

    setLoading(true);
    try {
      const userDocRef = doc(collection(db, 'users'));
      const registrarAccount: UserAccount = {
        id: userDocRef.id,
        storeId: selectedStoreIdForReg,
        storeName: targetStore?.name || 'Store',
        role: 'product_register',
        name: rName,
        username: uName,
        password: pWord,
        createdAt: new Date().toISOString()
      };

      await setDoc(userDocRef, cleanFirestoreData(registrarAccount));
      showNotification('success', `Product Register user "${rName}" created successfully!`);
      setRegistrarName('');
      setRegistrarUsername('');
      setRegistrarPassword('');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to add product register: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Create Customer Price Checker Terminal
  const handleCreatePriceChecker = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!selectedStoreIdForPriceChecker) {
      showNotification('error', 'Please create or select a store first.');
      return;
    }

    const tName = priceCheckerName.trim() || 'Store Customer Price Checker';
    const uName = priceCheckerUsername.trim().toLowerCase();
    const pWord = priceCheckerPassword.trim();

    if (!uName || !pWord) {
      showNotification('error', 'Username and password are required to create a price checker account.');
      return;
    }

    if (isUsernameTaken(uName)) {
      showNotification('error', `Username "${uName}" is already taken.`);
      return;
    }

    const targetStore = stores.find(s => s.id === selectedStoreIdForPriceChecker);

    setLoading(true);
    try {
      const userDocRef = doc(collection(db, 'users'));
      const priceCheckerAccount: UserAccount = {
        id: userDocRef.id,
        storeId: selectedStoreIdForPriceChecker,
        storeName: targetStore?.name || 'Store',
        role: 'customer_price_checker',
        name: tName,
        username: uName,
        password: pWord,
        createdAt: new Date().toISOString()
      };

      await setDoc(userDocRef, cleanFirestoreData(priceCheckerAccount));
      showNotification('success', `Customer Price Checker Terminal "${tName}" created successfully!`);
      setPriceCheckerName('');
      setPriceCheckerUsername('');
      setPriceCheckerPassword('');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to add customer price checker: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete Sub-user Account (Cashier / Registrar)
  const handleDeleteUserAccount = async () => {
    if (!userToDelete) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      showNotification('success', `Account "${userToDelete.name}" (${userToDelete.username}) deleted successfully.`);
      setUserToDelete(null);
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to delete account: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset Sub-user Password (Cashier / Registrar)
  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserModal) return;

    const pass = newUserPassword.trim();
    if (!pass) {
      showNotification('error', 'Password cannot be empty.');
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', resetUserModal.id), { password: pass });
      showNotification('success', `Password for "${resetUserModal.name}" updated successfully!`);
      setResetUserModal(null);
      setNewUserPassword('');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to reset password: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Batch toggle voice announcements for all stores
  const handleBatchVoiceToggle = async (enabled: boolean) => {
    if (stores.length === 0) {
      showNotification('error', 'No stores registered yet to update.');
      return;
    }
    setLoading(true);
    try {
      const promises = stores.map((s) => updateDoc(doc(db, 'stores', s.id), { voiceAnnouncementEnabled: enabled }));
      await Promise.all(promises);
      showNotification('success', `Voice generation has been ${enabled ? 'ALLOWED' : 'DISALLOWED'} across all ${stores.length} store(s)!`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to update voice policy: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Batch toggle camera barcode scanning for all stores
  const handleBatchCameraToggle = async (enabled: boolean) => {
    if (stores.length === 0) {
      showNotification('error', 'No stores registered yet to update.');
      return;
    }
    setLoading(true);
    try {
      const promises = stores.map((s) => updateDoc(doc(db, 'stores', s.id), { cameraScannerEnabled: enabled }));
      await Promise.all(promises);
      showNotification('success', `Camera barcode scanner has been ${enabled ? 'ENABLED' : 'DISABLED'} across all ${stores.length} store(s)!`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to update camera scanner policy: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Master SuperAdmin password update
  const handleUpdateMasterAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const pass = masterAdminPassword.trim();
    if (!pass) {
      showNotification('error', 'Password cannot be empty.');
      return;
    }
    setLoading(true);
    try {
      const superAdminUser = users.find(u => u.role === 'super_admin' || u.username === 'supermarketmanage@gmail.com');
      if (superAdminUser) {
        await updateDoc(doc(db, 'users', superAdminUser.id), { password: pass });
      } else {
        const newRef = doc(collection(db, 'users'));
        await setDoc(newRef, {
          id: newRef.id,
          username: 'supermarketmanage@gmail.com',
          name: 'Central Super Admin',
          role: 'super_admin',
          password: pass,
          createdAt: new Date().toISOString()
        });
      }
      showNotification('success', 'Master Super Admin password updated successfully!');
      setMasterAdminPassword('');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to update password: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-full pb-28 bg-slate-50 text-slate-900 p-4 sm:p-6 lg:p-8">
      {/* 8-Digit Safety PIN Verification Modal Gate */}
      {!isPinVerified && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 text-slate-900">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Super Admin Security Verification</h2>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Please enter your 8-digit Super Admin Safety Passkey to unlock Master Control.
              </p>
            </div>

            {pinError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <form onSubmit={handleVerifySafetyPin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                  8-Digit Safety Passkey
                </label>
                <input
                  type="password"
                  maxLength={8}
                  autoFocus
                  value={safetyPinInput}
                  onChange={(e) => setSafetyPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Enter 8-digit PIN..."
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-mono font-black tracking-widest text-center text-lg focus:outline-none focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl shadow-md text-sm uppercase tracking-wider transition-all cursor-pointer"
              >
                Verify & Unlock Dashboard
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Title Banner - Clean White Theme */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden"
        >
          <div className="space-y-2 z-10">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1.5 shadow-2xs">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-600" /> Super Admin Control
              </span>
              <span className="text-xs text-slate-500 font-semibold">Total Stores: {stores.length}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Central Supermarket <span className="text-orange-600">Master Control</span>
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl font-medium">
              Manage Supermarket Stores, enable or disable stores, reset passwords, set up Cash Counters, manage Product Registers, and view Security Matrix.
            </p>
          </div>

          <div className="flex items-center gap-3 z-10 shrink-0">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center min-w-[100px] shadow-2xs">
              <div className="text-2xl font-extrabold text-orange-600 font-mono">{stores.length}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stores</div>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center min-w-[100px] shadow-2xs">
              <div className="text-2xl font-extrabold text-emerald-600 font-mono">
                {uniqueUsers.filter(u => u.role !== 'super_admin').length}
              </div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Accounts</div>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-2xl flex flex-col items-center justify-center min-w-[90px] shadow-2xs cursor-pointer transition-all hover:scale-105 active:scale-95"
                title="Log Out of Central Super Admin"
              >
                <LogOut className="w-5 h-5 text-red-600 mb-1" />
                <span className="text-xs font-extrabold uppercase tracking-wider">Log Out</span>
              </button>
            )}
          </div>
        </motion.div>

        {/* Global Notifications */}
        {msg && (
          <div className={`p-4 rounded-2xl border flex items-center gap-3 text-sm font-semibold shadow-sm transition-all ${
            msg.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
              : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            {msg.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        {/* Action Tabs Navigation */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('stores')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all ${
              activeTab === 'stores'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" /> 1. Manage Stores & Admins
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('cash_counters')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all ${
              activeTab === 'cash_counters'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Calculator className="w-4 h-4" /> 2. Add Cash Counters
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('product_registers')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all ${
              activeTab === 'product_registers'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <PackageCheck className="w-4 h-4" /> 3. Add Product Registers
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('price_checkers')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all ${
              activeTab === 'price_checkers'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ScanLine className="w-4 h-4" /> 4. Customer Price Checkers
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('all_accounts')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all ${
              activeTab === 'all_accounts'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" /> 5. Security Matrix & Accounts
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all ${
              activeTab === 'settings'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" /> 6. Global Settings & Master Policies
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('database_usage')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all ${
              activeTab === 'database_usage'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Database className="w-4 h-4" /> 7. Real-Time Database Usage
          </motion.button>
        </div>

        {/* TAB 1: STORES & STORE ADMINS */}
        {activeTab === 'stores' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Create Store Form */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-orange-600" /> {newStoreType === 'branch' ? 'Create Regional Branch' : 'Create New Supermarket Store'}
                </h2>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {newStoreType === 'branch' 
                    ? 'Create a regional branch location assigned to an existing main store chain.'
                    : 'Assign a unique store name and store admin username & password.'}
                </p>
              </div>

              <form onSubmit={handleCreateStore} className="space-y-4">
                {/* Entity Type Toggle: Main Store vs Regional Branch */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Store Entity Type
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setNewStoreType('main')}
                      className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        newStoreType === 'main'
                          ? 'bg-orange-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <StoreIcon className="w-3.5 h-3.5" />
                      <span>Main Store</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewStoreType('branch')}
                      className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        newStoreType === 'branch'
                          ? 'bg-orange-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Regional Branch</span>
                    </button>
                  </div>
                </div>

                {newStoreType === 'branch' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Select Parent Main Store *
                      </label>
                      <select
                        required
                        value={parentStoreIdForBranch}
                        onChange={(e) => setParentStoreIdForBranch(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                      >
                        <option value="">-- Choose Parent Supermarket --</option>
                        {stores.filter(s => !s.isBranch).map(s => (
                          <option key={s.id} value={s.id}>{s.name} (@{s.adminUsername})</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Branch Code
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. BR-01"
                          value={newBranchCode}
                          onChange={(e) => setNewBranchCode(e.target.value)}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-mono font-bold focus:outline-none focus:bg-white focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Admin Salary (Rs.)
                        </label>
                        <input
                          type="number"
                          placeholder="e.g. 50000"
                          value={newBranchAdminSalary}
                          onChange={(e) => setNewBranchAdminSalary(e.target.value)}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-mono focus:outline-none focus:bg-white focus:border-orange-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Monthly Admin Overhead (Rs.)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 15000"
                        value={newAdministrativeExpenses}
                        onChange={(e) => setNewAdministrativeExpenses(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-mono focus:outline-none focus:bg-white focus:border-orange-500"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {newStoreType === 'branch' ? 'Branch Name' : 'Store Name'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={newStoreType === 'branch' ? 'e.g. Metro Supermarket - Saddar Branch' : 'Enter store name'}
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {newStoreType === 'branch' ? 'Branch Admin Username' : 'Store Admin Username'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter admin username"
                    value={newStoreAdminUsername}
                    onChange={(e) => setNewStoreAdminUsername(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {newStoreType === 'branch' ? 'Branch Admin Password' : 'Store Admin Password'}
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={newStoreAdminPassword}
                    onChange={(e) => setNewStoreAdminPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                {/* Built-in Camera Scanner Default Setting */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Camera className="w-4 h-4 text-orange-600 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">Inbuilt Barcode Camera Scanner</div>
                      <div className="text-[11px] text-slate-500 font-medium">Enable camera scanning for cashiers in this store</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewStoreCameraScannerEnabled(!newStoreCameraScannerEnabled)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer ${
                      newStoreCameraScannerEnabled
                        ? 'bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100'
                        : 'bg-slate-200 border-slate-300 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    {newStoreCameraScannerEnabled ? (
                      <>
                        <ToggleRight className="w-4 h-4 text-purple-600" />
                        <span>Enabled</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-4 h-4 text-slate-400" />
                        <span>Disabled</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Voice Generation & Audio Announcements Super Admin Setting */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Volume2 className="w-4 h-4 text-orange-600 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">Voice Generation & Speech</div>
                      <div className="text-[11px] text-slate-500 font-medium">Allow speech checkout bill amounts & greetings</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewStoreVoiceAnnouncementEnabled(!newStoreVoiceAnnouncementEnabled)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer ${
                      newStoreVoiceAnnouncementEnabled
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-slate-200 border-slate-300 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    {newStoreVoiceAnnouncementEnabled ? (
                      <>
                        <ToggleRight className="w-4 h-4 text-emerald-600" />
                        <span>Allowed</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-4 h-4 text-slate-400" />
                        <span>Disallowed</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl shadow-md shadow-orange-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <Plus className="w-4 h-4" />
                  {loading ? 'Creating...' : newStoreType === 'branch' ? 'Create Regional Branch' : 'Create Supermarket Store'}
                </button>
              </form>
            </div>

            {/* Registered Stores List & Hierarchical Chain Drill-down */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <StoreIcon className="w-5 h-5 text-orange-600" /> Supermarket Stores Hierarchy ({stores.length})
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Click any store to create branch admin accounts, then click the branch to create POS counters, registrars & staff.
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                  {stores.filter(s => !s.isBranch).length} Stores • {stores.filter(s => s.isBranch).length} Branches
                </span>
              </div>

              <div className="space-y-4">
                {stores.length === 0 ? (
                  <p className="text-sm text-slate-500 p-8 text-center border border-dashed border-slate-300 rounded-2xl font-medium">
                    No supermarket stores created yet. Use the form on the left to add your first store.
                  </p>
                ) : (
                  (() => {
                    const mainStores = stores.filter(s => !s.isBranch);
                    const allChildBranchIds = new Set<string>();

                    return (
                      <div className="space-y-4">
                        {mainStores.map(s => {
                          const isDisabled = s.status === 'disabled';
                          const isVoiceAllowed = s.voiceAnnouncementEnabled !== false;
                          const childBranches = stores.filter(b => b.isBranch && (b.parentStoreId === s.id || b.parentStoreId === s.adminUsername));
                          childBranches.forEach(b => allChildBranchIds.add(b.id));

                          const directCashierCount = users.filter(u => u.storeId === s.id && u.role === 'cash_counter').length;
                          const directRegistrarCount = users.filter(u => u.storeId === s.id && u.role === 'product_register').length;
                          const isExpanded = expandedStoreId === s.id;

                          return (
                            <div 
                              key={s.id} 
                              className={`rounded-2xl border transition-all overflow-hidden ${
                                isDisabled ? 'bg-slate-50 border-red-200' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                              }`}
                            >
                              {/* Main Store Card Header */}
                              <div className="p-5 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                      <h3 className="text-base font-extrabold text-slate-900">{s.name}</h3>
                                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 uppercase tracking-wider border border-orange-200">
                                        Main Chain Store
                                      </span>
                                      {isDisabled ? (
                                        <span className="text-[11px] font-bold bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full border border-red-200 flex items-center gap-1">
                                          <Ban className="w-3 h-3" /> Disabled
                                        </span>
                                      ) : (
                                        <span className="text-[11px] font-bold bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                                          <CheckCircle className="w-3 h-3" /> Active
                                        </span>
                                      )}
                                      <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                                        <Building2 className="w-3 h-3" /> {childBranches.length} {childBranches.length === 1 ? 'Branch' : 'Branches'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 font-medium">
                                      Store Admin: <span className="text-slate-800 font-bold font-mono">@{s.adminUsername}</span> | ID: <span className="font-mono">{s.id.substring(0, 8)}</span>
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                    {/* Primary Action: Create Branch Admin Account under this store */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCreateBranchModalStore(s);
                                        setModalBranchName(`${s.name} - Branch 1`);
                                        setModalBranchCode(`BR-0${childBranches.length + 1}`);
                                      }}
                                      className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-orange-600/20 cursor-pointer transition-all"
                                      title="Create a new regional branch admin account under this supermarket store"
                                    >
                                      <Plus className="w-4 h-4" />
                                      <span>Create Branch Admin</span>
                                    </button>

                                    {/* Expand / View Branches Hierarchy Toggle */}
                                    <button
                                      type="button"
                                      onClick={() => setExpandedStoreId(isExpanded ? null : s.id)}
                                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                                        isExpanded 
                                          ? 'bg-slate-900 text-white border-slate-900' 
                                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                                      }`}
                                    >
                                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      <span>{isExpanded ? 'Hide Hierarchy' : `Branches (${childBranches.length})`}</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Controls Row */}
                                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-2 text-slate-500 font-medium">
                                    <span>Direct Cashiers: <strong className="text-slate-800">{directCashierCount}</strong></span>
                                    <span>•</span>
                                    <span>Registers: <strong className="text-slate-800">{directRegistrarCount}</strong></span>
                                    <span>•</span>
                                    <span>Inbuilt Camera: <strong className={s.cameraScannerEnabled !== false ? 'text-purple-700' : 'text-slate-500'}>{s.cameraScannerEnabled !== false ? 'ON' : 'OFF'}</strong></span>
                                    <span>•</span>
                                    <span>Voice: <strong className={isVoiceAllowed ? 'text-emerald-700' : 'text-rose-700'}>{isVoiceAllowed ? 'Allowed' : 'Blocked'}</strong></span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleToggleStoreStatus(s)}
                                      disabled={loading}
                                      className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 text-xs cursor-pointer ${
                                        isDisabled 
                                          ? 'bg-emerald-600 text-white hover:bg-emerald-500' 
                                          : 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200'
                                      }`}
                                    >
                                      <Power className="w-3.5 h-3.5" />
                                      {isDisabled ? 'Enable' : 'Disable'}
                                    </button>

                                    <button
                                      onClick={() => setResetStoreModal(s)}
                                      className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                                    >
                                      <KeyRound className="w-3.5 h-3.5" /> Reset Pass
                                    </button>

                                    {onSelectStoreToManage && (
                                      <button
                                        onClick={() => onSelectStoreToManage(s)}
                                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
                                      >
                                        <Eye className="w-3.5 h-3.5 text-orange-600" /> Inspect
                                      </button>
                                    )}

                                    <button
                                      onClick={() => setStoreToDelete(s)}
                                      className="px-2.5 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-bold rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* HIERARCHICAL DRILL-DOWN: REGIONAL BRANCHES UNDER THIS STORE */}
                              {isExpanded && (
                                <div className="p-5 bg-slate-50 border-t border-slate-200 space-y-4">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                                    <div>
                                      <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-orange-600" />
                                        Regional Branches of {s.name} ({childBranches.length})
                                      </h4>
                                      <p className="text-xs text-slate-500 mt-0.5">
                                        Click any regional branch to create cash counters, registrars, price checkers, and branch staff.
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCreateBranchModalStore(s);
                                        setModalBranchName(`${s.name} - Branch ${childBranches.length + 1}`);
                                        setModalBranchCode(`BR-0${childBranches.length + 1}`);
                                      }}
                                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all self-start sm:self-auto"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>+ Create Branch Admin Account</span>
                                    </button>
                                  </div>

                                  {childBranches.length === 0 ? (
                                    <div className="p-6 bg-white rounded-xl border border-dashed border-slate-300 text-center space-y-2">
                                      <Building2 className="w-8 h-8 mx-auto text-slate-300" />
                                      <p className="text-xs font-bold text-slate-700">No regional branches created for {s.name} yet</p>
                                      <p className="text-[11px] text-slate-500">
                                        Click the <strong className="text-orange-600">"+ Create Branch Admin Account"</strong> button above to assign a regional branch location.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {childBranches.map(branch => {
                                        const branchUsers = users.filter(u => u.storeId === branch.id);
                                        const isBranchExpanded = expandedBranchId === branch.id;
                                        const branchCashiers = branchUsers.filter(u => u.role === 'cash_counter');
                                        const branchRegistrars = branchUsers.filter(u => u.role === 'product_register');
                                        const branchPriceCheckers = branchUsers.filter(u => u.role === 'price_checker');
                                        const branchStaffMembers = branchUsers.filter(u => u.role === 'staff' || u.role === 'inventory_manager');

                                        return (
                                          <div 
                                            key={branch.id} 
                                            className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs hover:border-slate-300 transition-all"
                                          >
                                            {/* Branch Summary Bar */}
                                            <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                              <div 
                                                className="cursor-pointer flex-1"
                                                onClick={() => setExpandedBranchId(isBranchExpanded ? null : branch.id)}
                                              >
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="font-extrabold text-sm text-slate-900">{branch.name}</span>
                                                  {branch.branchCode && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                      {branch.branchCode}
                                                    </span>
                                                  )}
                                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200">
                                                    Branch Admin: @{branch.branchAdminUsername || branch.adminUsername}
                                                  </span>
                                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                                                    Admin Salary: Rs. {(Number(branch.branchAdminSalary) || 0).toLocaleString()}
                                                  </span>
                                                  {Number(branch.administrativeExpenses) > 0 && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                                                      Overhead: Rs. {(Number(branch.administrativeExpenses) || 0).toLocaleString()}
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 font-medium">
                                                  <span>Accounts: <strong className="text-slate-900">{branchUsers.length}</strong></span>
                                                  <span>•</span>
                                                  <span>Cashiers: <strong className="text-slate-800">{branchCashiers.length}</strong></span>
                                                  <span>•</span>
                                                  <span>Registers: <strong className="text-slate-800">{branchRegistrars.length}</strong></span>
                                                  <span>•</span>
                                                  <span>Staff: <strong className="text-slate-800">{branchStaffMembers.length}</strong></span>
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-2 shrink-0">
                                                {/* Click into branch to create further accounts */}
                                                <button
                                                  type="button"
                                                  onClick={() => setExpandedBranchId(isBranchExpanded ? null : branch.id)}
                                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                                                    isBranchExpanded
                                                      ? 'bg-orange-600 text-white shadow-2xs'
                                                      : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200'
                                                  }`}
                                                >
                                                  {isBranchExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                  <span>{isBranchExpanded ? 'Hide Accounts' : `Create & View Accounts (${branchUsers.length})`}</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => setResetStoreModal(branch)}
                                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                                  title="Reset Branch Admin Password"
                                                >
                                                  <KeyRound className="w-4 h-4" />
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => setStoreToDelete(branch)}
                                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                  title="Delete Branch"
                                                >
                                                  <Trash2 className="w-4 h-4" />
                                                </button>
                                              </div>
                                            </div>

                                            {/* EXPANDED BRANCH: CREATE FURTHER ACCOUNTS FOR THIS BRANCH */}
                                            {isBranchExpanded && (
                                              <div className="p-4 bg-slate-100/70 border-t border-slate-200 space-y-4">
                                                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                                                  <div>
                                                    <div className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                                      <UserPlus className="w-4 h-4 text-orange-600" />
                                                      Create Further Accounts for {branch.name}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500">
                                                      Add POS cashiers, product registrars, price checkers, or staff members directly linked to this branch.
                                                    </div>
                                                  </div>

                                                  <div className="flex items-center gap-2 flex-wrap">
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setCreateBranchAccountModal({ branch, accountType: 'cash_counter' });
                                                        setModalAccountName(`${branch.name} POS Counter ${branchCashiers.length + 1}`);
                                                        setModalAccountCounterNum(String(branchCashiers.length + 1));
                                                      }}
                                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                                                    >
                                                      <Calculator className="w-3.5 h-3.5" />
                                                      <span>+ Cash Counter</span>
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setCreateBranchAccountModal({ branch, accountType: 'product_register' });
                                                        setModalAccountName(`${branch.name} Registrar`);
                                                      }}
                                                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                                                    >
                                                      <PackageCheck className="w-3.5 h-3.5" />
                                                      <span>+ Product Registrar</span>
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setCreateBranchAccountModal({ branch, accountType: 'price_checker' });
                                                        setModalAccountName(`${branch.name} Kiosk`);
                                                      }}
                                                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                                                    >
                                                      <ScanLine className="w-3.5 h-3.5" />
                                                      <span>+ Price Checker</span>
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setCreateBranchAccountModal({ branch, accountType: 'staff' });
                                                        setModalAccountName(`${branch.name} Staff`);
                                                      }}
                                                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                                                    >
                                                      <Users className="w-3.5 h-3.5" />
                                                      <span>+ Branch Staff</span>
                                                    </button>
                                                  </div>
                                                </div>

                                                {/* Sub-Accounts List Table for this Branch */}
                                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                                                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                                                    <span>Active Sub-Accounts in {branch.name} ({branchUsers.length})</span>
                                                    <span className="text-[11px] text-slate-500">Salaries deducted monthly from profit</span>
                                                  </div>

                                                  {branchUsers.length === 0 ? (
                                                    <div className="p-6 text-center text-slate-400 text-xs font-medium">
                                                      No sub-accounts created for this branch yet. Use the buttons above to add cashiers, registrars, or staff.
                                                    </div>
                                                  ) : (
                                                    <div className="overflow-x-auto">
                                                      <table className="w-full text-left text-xs border-collapse">
                                                        <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                                                          <tr>
                                                            <th className="p-2.5">Role</th>
                                                            <th className="p-2.5">Name</th>
                                                            <th className="p-2.5">Username</th>
                                                            <th className="p-2.5">Counter / Cashier</th>
                                                            <th className="p-2.5">Monthly Salary</th>
                                                            <th className="p-2.5 text-center w-28">Actions</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                          {branchUsers.map(user => (
                                                            <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                                                              <td className="p-2.5">
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                                                  user.role === 'branch_admin' ? 'bg-purple-100 text-purple-800' :
                                                                  user.role === 'cash_counter' ? 'bg-emerald-100 text-emerald-800' :
                                                                  user.role === 'product_register' ? 'bg-blue-100 text-blue-800' :
                                                                  user.role === 'price_checker' ? 'bg-indigo-100 text-indigo-800' :
                                                                  'bg-amber-100 text-amber-800'
                                                                }`}>
                                                                  {user.role.replace('_', ' ')}
                                                                </span>
                                                              </td>
                                                              <td className="p-2.5 font-bold text-slate-900">{user.name}</td>
                                                              <td className="p-2.5 font-mono text-slate-700">@{user.username}</td>
                                                              <td className="p-2.5 font-medium text-slate-600">
                                                                {user.counterNumber ? `Counter #${user.counterNumber}` : '—'}
                                                              </td>
                                                              <td className="p-2.5 font-mono font-bold text-emerald-700">
                                                                {user.salary ? `Rs. ${Number(user.salary).toLocaleString()}` : '—'}
                                                              </td>
                                                              <td className="p-2.5 text-center">
                                                                <div className="flex items-center justify-center gap-1">
                                                                  <button
                                                                    type="button"
                                                                    onClick={() => setResetUserModal(user)}
                                                                    className="px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg cursor-pointer"
                                                                    title="Reset Password"
                                                                  >
                                                                    Reset
                                                                  </button>
                                                                  <button
                                                                    type="button"
                                                                    onClick={() => setUserToDelete(user)}
                                                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                                                                    title="Delete Account"
                                                                  >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                  </button>
                                                                </div>
                                                              </td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Any Standalone Branches without matching parent store */}
                        {stores.filter(s => s.isBranch && !allChildBranchIds.has(s.id)).length > 0 && (
                          <div className="pt-4 border-t border-slate-200">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                              Other Regional Branches ({stores.filter(s => s.isBranch && !allChildBranchIds.has(s.id)).length})
                            </h4>
                            <div className="space-y-3">
                              {stores.filter(s => s.isBranch && !allChildBranchIds.has(s.id)).map(branch => (
                                <div key={branch.id} className="p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                                  <div>
                                    <div className="font-bold text-sm text-slate-900">{branch.name}</div>
                                    <div className="text-xs text-slate-500">
                                      Admin: <span className="font-mono text-slate-800 font-bold">@{branch.adminUsername || branch.branchAdminUsername}</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => setResetStoreModal(branch)}
                                    className="px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-700 rounded-lg border border-blue-200"
                                  >
                                    Reset Password
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CASH COUNTERS */}
        {activeTab === 'cash_counters' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-emerald-600" /> Add Cash Counter Account
                </h2>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Create cash counters assigned to a specific store.
                </p>
              </div>

              <form onSubmit={handleCreateCashCounter} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Select Supermarket Store
                  </label>
                  <select
                    value={selectedStoreIdForCounter}
                    onChange={(e) => setSelectedStoreIdForCounter(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-semibold"
                  >
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Counter Number
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 1, 2, 3"
                      value={counterNumber}
                      onChange={(e) => setCounterNumber(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Cashier Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={counterName}
                      onChange={(e) => setCounterName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Cashier Username
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter cashier username"
                    value={counterUsername}
                    onChange={(e) => setCounterUsername(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Cashier Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={counterPassword}
                    onChange={(e) => setCounterPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  {loading ? 'Adding Counter...' : 'Add Cash Counter Account'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
                <Calculator className="w-5 h-5 text-emerald-600" /> Active Cash Counter Accounts
              </h2>

              <div className="space-y-3">
                {users.filter(u => u.role === 'cash_counter').length === 0 ? (
                  <p className="text-sm text-slate-500 p-6 text-center border border-dashed border-slate-300 rounded-xl font-medium">
                    No cash counters created yet. Add one using the form on the left!
                  </p>
                ) : (
                  users.filter(u => u.role === 'cash_counter').map(cc => (
                    <div key={cc.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm">{cc.name}</span>
                          <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">
                            Counter #{cc.counterNumber}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 font-medium">
                          Store: <span className="text-slate-900 font-bold">{cc.storeName}</span> | Username: <span className="text-orange-600 font-bold font-mono">{cc.username}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setResetUserModal(cc)}
                          className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                        >
                          Reset Pass
                        </button>
                        <button
                          onClick={() => setUserToDelete(cc)}
                          className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                          title="Delete Account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PRODUCT REGISTERS */}
        {activeTab === 'product_registers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-blue-600" /> Add Product Register User
                </h2>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Product registers scan barcodes, register new items, and update inventory prices and stock.
                </p>
              </div>

              <form onSubmit={handleCreateProductRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Select Supermarket Store
                  </label>
                  <select
                    value={selectedStoreIdForReg}
                    onChange={(e) => setSelectedStoreIdForReg(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-semibold"
                  >
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Register Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter register full name"
                    value={registrarName}
                    onChange={(e) => setRegistrarName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Login Username
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter register username"
                    value={registrarUsername}
                    onChange={(e) => setRegistrarUsername(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Login Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={registrarPassword}
                    onChange={(e) => setRegistrarPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  {loading ? 'Creating...' : 'Create Product Register Account'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
                <PackageCheck className="w-5 h-5 text-blue-600" /> Active Product Register Accounts
              </h2>

              <div className="space-y-3">
                {users.filter(u => u.role === 'product_register').length === 0 ? (
                  <p className="text-sm text-slate-500 p-6 text-center border border-dashed border-slate-300 rounded-xl font-medium">
                    No product registers created yet. Add one using the form on the left!
                  </p>
                ) : (
                  users.filter(u => u.role === 'product_register').map(pr => (
                    <div key={pr.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm">{pr.name}</span>
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                            Product Register
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 font-medium">
                          Store: <span className="text-slate-900 font-bold">{pr.storeName}</span> | Username: <span className="text-orange-600 font-bold font-mono">{pr.username}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setResetUserModal(pr)}
                          className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                        >
                          Reset Pass
                        </button>
                        <button
                          onClick={() => setUserToDelete(pr)}
                          className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                          title="Delete Account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CUSTOMER PRICE CHECKERS */}
        {activeTab === 'price_checkers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ScanLine className="w-5 h-5 text-orange-600" /> Add Customer Price Checker Kiosk
                </h2>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Create a dedicated account for in-store customer kiosk systems where shoppers scan product barcodes to check prices and stock.
                </p>
              </div>

              <form onSubmit={handleCreatePriceChecker} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Select Supermarket Store
                  </label>
                  <select
                    value={selectedStoreIdForPriceChecker}
                    onChange={(e) => setSelectedStoreIdForPriceChecker(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-semibold"
                  >
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Price Checker / Kiosk Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aisle 1 Price Checker or Store Kiosk"
                    value={priceCheckerName}
                    onChange={(e) => setPriceCheckerName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Login Username
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. pricecheck_store1"
                    value={priceCheckerUsername}
                    onChange={(e) => setPriceCheckerUsername(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Login Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={priceCheckerPassword}
                    onChange={(e) => setPriceCheckerPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl shadow-md shadow-orange-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  {loading ? 'Creating Account...' : 'Create Customer Price Checker Account'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
                <ScanLine className="w-5 h-5 text-orange-600" /> Active Customer Price Checkers
              </h2>

              <div className="space-y-3">
                {users.filter(u => u.role === 'customer_price_checker').length === 0 ? (
                  <p className="text-sm text-slate-500 p-6 text-center border border-dashed border-slate-300 rounded-xl font-medium">
                    No customer price checkers created yet. Create an account on the left to set up price checking screens in your store!
                  </p>
                ) : (
                  users.filter(u => u.role === 'customer_price_checker').map(pc => (
                    <div key={pc.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm">{pc.name}</span>
                          <span className="text-xs bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full font-bold border border-purple-200">
                            Customer Kiosk
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 font-medium">
                          Store: <span className="text-slate-900 font-bold">{pc.storeName}</span> | Username: <span className="text-orange-600 font-bold font-mono">{pc.username}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setResetUserModal(pc)}
                          className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                        >
                          Reset Pass
                        </button>
                        <button
                          onClick={() => setUserToDelete(pc)}
                          className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                          title="Delete Account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ALL SYSTEM ACCOUNTS & SECURITY MATRIX */}
        {activeTab === 'all_accounts' && (
          <div className="space-y-6">
            
            {/* Super Admin Top Control Box */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-100 rounded-xl text-red-700 border border-red-200">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">Master Super Administrator</h2>
                    <p className="text-xs text-slate-500 font-medium">Global System Owner & Multi-Store Director</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-red-100 text-red-800 font-bold rounded-full text-xs border border-red-200">
                  Root Authority
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-medium">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 font-bold block mb-1">Super Admin Account</span>
                  <span className="text-slate-900 font-extrabold">Super Administrator</span>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 font-bold block mb-1">Master Username / Email</span>
                  <span className="text-orange-600 font-extrabold font-mono text-sm">supermarketmanage@gmail.com</span>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 font-bold block mb-1">Security Status</span>
                  <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Protected Master Key
                  </span>
                </div>
              </div>
            </div>

            {/* STORES SECURITY MATRIX */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-orange-600" /> Stores Security Matrix ({stores.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    Store names, Admin usernames and passwords, enable/disable controls, and Further Details.
                  </p>
                </div>
              </div>

              {stores.length === 0 ? (
                <div className="text-center p-8 text-slate-500 border border-dashed border-slate-300 rounded-2xl">
                  No stores created in the system yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {stores.map((s) => {
                    const storeCashiers = users.filter(u => u.storeId === s.id && u.role === 'cash_counter');
                    const storeRegistrars = users.filter(u => u.storeId === s.id && u.role === 'product_register');
                    const isPassVisible = showPasswordStoreId === s.id;
                    const isDisabled = s.status === 'disabled';

                    return (
                      <div 
                        key={s.id}
                        className={`p-5 rounded-2xl border transition-all space-y-4 ${
                          isDisabled ? 'bg-slate-50 border-red-200' : 'bg-white border-slate-200 shadow-sm'
                        }`}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                          
                          {/* Store Name & ID */}
                          <div className="md:col-span-4 space-y-1">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-orange-600 shrink-0" />
                              <span className="font-extrabold text-base text-slate-900">{s.name}</span>
                              {isDisabled ? (
                                <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full border border-red-200">
                                  Disabled
                                </span>
                              ) : (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 font-mono pl-6">
                              ID: {s.id}
                            </p>
                          </div>

                          {/* Admin Username */}
                          <div className="md:col-span-3 space-y-0.5">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Store Admin Username</span>
                            <span className="text-sm font-extrabold font-mono text-orange-600 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200 inline-block">
                              {s.adminUsername}
                            </span>
                          </div>

                          {/* Admin Password & Eye Toggle */}
                          <div className="md:col-span-3 space-y-0.5">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Store Admin Password</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-extrabold font-mono text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 inline-block min-w-[100px]">
                                {isPassVisible ? (s.adminPassword || '••••••••') : '••••••••'}
                              </span>
                              <button
                                onClick={() => setShowPasswordStoreId(isPassVisible ? null : s.id)}
                                className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                                title={isPassVisible ? "Hide Password" : "Show Password"}
                              >
                                {isPassVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="md:col-span-2 flex flex-col gap-2 justify-end">
                            <button
                              onClick={() => setFurtherDetailsStore(s)}
                              className="w-full py-2 px-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                              <Info className="w-4 h-4" />
                              <span>Further Details</span>
                            </button>
                          </div>

                        </div>

                        {/* Secondary Store Bar */}
                        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 text-slate-600 font-medium flex-wrap">
                            <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                              Cashiers: <strong className="text-emerald-700">{storeCashiers.length}</strong>
                            </span>
                            <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                              Registers: <strong className="text-blue-700">{storeRegistrars.length}</strong>
                            </span>
                            <button
                              onClick={() => handleToggleVoiceAnnouncement(s)}
                              disabled={loading}
                              className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                s.voiceAnnouncementEnabled !== false
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                              }`}
                              title="Click to toggle audio voice generation for this store"
                            >
                              {s.voiceAnnouncementEnabled !== false ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                              <span>Voice: {s.voiceAnnouncementEnabled !== false ? 'Allowed' : 'Disallowed'}</span>
                            </button>
                            <button
                              onClick={() => handleToggleCameraScanner(s)}
                              disabled={loading}
                              className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                s.cameraScannerEnabled !== false
                                  ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                              }`}
                              title="Click to toggle inbuilt camera scanner for this store"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Camera Scanner: {s.cameraScannerEnabled !== false ? 'Enabled' : 'Disabled'}</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleStoreStatus(s)}
                              disabled={loading}
                              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all cursor-pointer ${
                                isDisabled 
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-500' 
                                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                              {isDisabled ? 'Enable Store' : 'Disable Store'}
                            </button>

                            <button
                              onClick={() => setResetStoreModal(s)}
                              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5" /> Change Password
                            </button>

                            <button
                              onClick={() => setStoreToDelete(s)}
                              className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete Store
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MASTER DIRECTORY OF ALL REGISTERED ACCOUNTS & PASSWORDS */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-600" /> Master Directory of All Registered Accounts ({uniqueUsers.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    All store admins, branch managers, cashiers, product registrars, and price checkers permanently saved in the system.
                  </p>
                </div>
                <div className="text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                  Total Active Logins: <span className="text-emerald-700 font-black">{uniqueUsers.length}</span>
                </div>
              </div>

              {uniqueUsers.length === 0 ? (
                <div className="text-center p-8 text-slate-500 border border-dashed border-slate-300 rounded-2xl font-medium">
                  No accounts registered in the database yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-4">Account Name</th>
                        <th className="py-3 px-4">Username</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Store / Location</th>
                        <th className="py-3 px-4">Password</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {uniqueUsers.map((u) => {
                        const isUserPassVisible = showUserPasswordId === u.id;
                        let roleBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                        let roleLabel = u.role.replace('_', ' ').toUpperCase();

                        if (u.role === 'super_admin') {
                          roleBadge = 'bg-red-100 text-red-800 border-red-200 font-black';
                          roleLabel = 'SUPER ADMIN';
                        } else if (u.role === 'store_admin') {
                          roleBadge = 'bg-orange-100 text-orange-800 border-orange-200 font-black';
                          roleLabel = 'STORE ADMIN';
                        } else if (u.role === 'branch_admin') {
                          roleBadge = 'bg-amber-100 text-amber-800 border-amber-200 font-black';
                          roleLabel = 'BRANCH ADMIN';
                        } else if (u.role === 'cash_counter') {
                          roleBadge = 'bg-emerald-100 text-emerald-800 border-emerald-200 font-black';
                          roleLabel = u.counterNumber ? `CASHIER #${u.counterNumber}` : 'CASHIER';
                        } else if (u.role === 'product_register') {
                          roleBadge = 'bg-blue-100 text-blue-800 border-blue-200 font-black';
                          roleLabel = 'PRODUCT REGISTRAR';
                        } else if (u.role === 'customer_price_checker') {
                          roleBadge = 'bg-purple-100 text-purple-800 border-purple-200 font-black';
                          roleLabel = 'PRICE CHECKER';
                        }

                        return (
                          <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {u.name || u.username}
                              {u.role === 'super_admin' && (
                                <span className="ml-2 text-[10px] text-red-600 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                  Root
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-orange-600">
                              @{u.username}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] border inline-block ${roleBadge}`}>
                                {roleLabel}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium">
                              {u.storeName || (u.storeId === 'all' ? 'All Stores (Global)' : 'Main Store')}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block min-w-[70px]">
                                  {isUserPassVisible ? (u.password || '••••••••') : '••••••••'}
                                </span>
                                {u.password && (
                                  <button
                                    type="button"
                                    onClick={() => setShowUserPasswordId(isUserPassVisible ? null : u.id)}
                                    className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 cursor-pointer"
                                    title={isUserPassVisible ? "Hide password" : "Show password"}
                                  >
                                    {isUserPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {u.role !== 'super_admin' && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setResetUserModal(u)}
                                    className="px-2 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer transition-colors"
                                  >
                                    Reset
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setUserToDelete(u)}
                                    className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                                    title="Delete Account"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: GLOBAL SETTINGS & MASTER POLICIES */}
        {activeTab === 'settings' && (
          <div className="space-y-8 animate-fade-in">
            {/* Top Overview Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1.5 w-fit">
                  <Sliders className="w-3.5 h-3.5" /> Super Admin Central Settings
                </span>
                <h2 className="text-2xl font-black tracking-tight text-white">
                  Master Policies & Global Platform Settings
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl font-medium leading-relaxed">
                  Enforce global store audio speech policies, manage master administrator credentials, toggle barcode hardware permissions, and view cloud database diagnostic statuses.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 shrink-0">
                <div className="p-3.5 bg-white/10 rounded-2xl border border-white/10 text-center min-w-[110px] backdrop-blur-sm">
                  <div className="text-xl font-black text-amber-400">
                    {stores.filter(s => s.voiceAnnouncementEnabled !== false).length} / {stores.length}
                  </div>
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mt-0.5">Voice Enabled</div>
                </div>
                <div className="p-3.5 bg-white/10 rounded-2xl border border-white/10 text-center min-w-[110px] backdrop-blur-sm">
                  <div className="text-xl font-black text-purple-400">
                    {stores.filter(s => s.cameraScannerEnabled !== false).length} / {stores.length}
                  </div>
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mt-0.5">Camera Active</div>
                </div>
              </div>
            </div>

            {/* Grid for Master Account & Batch Policies */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Card 1: Master Super Admin Security (5 cols) */}
              <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-orange-100 text-orange-700 rounded-2xl">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">Master Super Admin Security</h3>
                      <p className="text-xs text-slate-500 font-medium">Update master root administrator credentials</p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-semibold">Master Admin Username:</span>
                      <span className="font-mono font-bold text-orange-600">supermarketmanage@gmail.com</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-semibold">Role Tier:</span>
                      <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md text-[10px]">
                        GLOBAL SUPER_ADMIN
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-semibold">System Privileges:</span>
                      <span className="font-bold text-slate-800">Unrestricted Master Control</span>
                    </div>
                  </div>

                  <form onSubmit={handleUpdateMasterAdminPassword} className="space-y-3.5 pt-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Set New Master Password
                    </label>
                    <div className="relative">
                      <input
                        type={showMasterPassword ? 'text' : 'password'}
                        placeholder="Enter new master password"
                        value={masterAdminPassword}
                        onChange={(e) => setMasterAdminPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-orange-500 font-medium pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMasterPassword(!showMasterPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                        title="Toggle password"
                      >
                        {showMasterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !masterAdminPassword.trim()}
                      className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
                    >
                      <Save className="w-4 h-4" /> Update Master Admin Password
                    </button>
                  </form>
                </div>

                <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
                  Note: Updating this password immediately updates the root Super Admin credentials stored in Firestore.
                </div>
              </div>

              {/* Card 2: Batch Global Store Policies (7 cols) */}
              <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Master Policy Controller</h3>
                    <p className="text-xs text-slate-500 font-medium">Apply batch settings to all registered supermarket stores simultaneously</p>
                  </div>
                </div>

                {/* Batch Voice Announcements Policy */}
                <div className="p-5 bg-gradient-to-br from-amber-50/70 to-orange-50/40 border border-amber-200/80 rounded-2xl space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-amber-200/60 text-amber-900 rounded-xl shrink-0 mt-0.5">
                        <Volume2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-amber-950 flex items-center gap-2">
                          Global Voice Announcement Policy
                          <span className="text-[10px] font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                            {stores.filter(s => s.voiceAnnouncementEnabled !== false).length} / {stores.length} Allowed
                          </span>
                        </h4>
                        <p className="text-xs text-amber-900/80 font-medium mt-1 leading-relaxed">
                          Controls whether customer voice thank you messages are announced when cashier checkout completes. As Super Admin, you can allow or disallow voice generation for all stores in one click.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => handleBatchVoiceToggle(true)}
                      disabled={loading || stores.length === 0}
                      className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Volume2 className="w-4 h-4" /> Allow Voice in ALL Stores
                    </button>

                    <button
                      type="button"
                      onClick={() => handleBatchVoiceToggle(false)}
                      disabled={loading || stores.length === 0}
                      className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      <VolumeX className="w-4 h-4" /> Disallow Voice in ALL Stores
                    </button>
                  </div>
                </div>

                {/* Batch Barcode Camera Scanner Policy */}
                <div className="p-5 bg-gradient-to-br from-purple-50/70 to-indigo-50/40 border border-purple-200/80 rounded-2xl space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-purple-200/60 text-purple-900 rounded-xl shrink-0 mt-0.5">
                        <Camera className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-purple-950 flex items-center gap-2">
                          Global Camera Barcode Scanner Policy
                          <span className="text-[10px] font-bold bg-purple-200/80 text-purple-900 px-2 py-0.5 rounded-full">
                            {stores.filter(s => s.cameraScannerEnabled !== false).length} / {stores.length} Enabled
                          </span>
                        </h4>
                        <p className="text-xs text-purple-900/80 font-medium mt-1 leading-relaxed">
                          Controls whether cashier POS counters can use the live video camera barcode reader or must rely purely on physical USB/Bluetooth handheld barcode scanners.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => handleBatchCameraToggle(true)}
                      disabled={loading || stores.length === 0}
                      className="py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4" /> Enable Camera on ALL Stores
                    </button>

                    <button
                      type="button"
                      onClick={() => handleBatchCameraToggle(false)}
                      disabled={loading || stores.length === 0}
                      className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Ban className="w-4 h-4" /> Disable Camera on ALL Stores
                    </button>
                  </div>
                </div>

              </div>

            </div>

            {/* Per-Store Policy Quick Matrix Table */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Per-Store Policy Matrix</h3>
                    <p className="text-xs text-slate-500 font-medium">Quick live switches for individual store voice and camera policies</p>
                  </div>
                </div>

                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 w-fit">
                  {stores.length} Registered Stores
                </span>
              </div>

              {stores.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-xs text-slate-500 font-medium">
                  No stores created yet. Use Tab 1 to create your first supermarket store.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4">Store Name</th>
                        <th className="py-3 px-4">Store Admin</th>
                        <th className="py-3 px-4 text-center">Voice Generation</th>
                        <th className="py-3 px-4 text-center">Camera Scanner</th>
                        <th className="py-3 px-4 text-center">Store Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {stores.map((s) => {
                        const voiceAllowed = s.voiceAnnouncementEnabled !== false;
                        const cameraActive = s.cameraScannerEnabled !== false;
                        const isActive = s.status !== 'disabled';

                        return (
                          <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-extrabold text-slate-900 text-sm">{s.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">ID: {s.id.slice(0, 8)}...</div>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="font-mono text-orange-600 font-bold">{s.adminUsername}</div>
                              <div className="text-[10px] text-slate-500">Store Manager</div>
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleVoiceAnnouncement(s)}
                                disabled={loading}
                                className={`px-3 py-1 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer border ${
                                  voiceAllowed
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                    : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                                }`}
                              >
                                {voiceAllowed ? (
                                  <>
                                    <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Allowed</span>
                                  </>
                                ) : (
                                  <>
                                    <VolumeX className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Disallowed</span>
                                  </>
                                )}
                              </button>
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleCameraScanner(s)}
                                disabled={loading}
                                className={`px-3 py-1 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer border ${
                                  cameraActive
                                    ? 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {cameraActive ? (
                                  <>
                                    <Camera className="w-3.5 h-3.5 text-purple-600" />
                                    <span>Enabled</span>
                                  </>
                                ) : (
                                  <>
                                    <Ban className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Disabled</span>
                                  </>
                                )}
                              </button>
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleStoreStatus(s)}
                                disabled={loading}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1 border cursor-pointer ${
                                  isActive
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                {isActive ? 'ACTIVE' : 'DISABLED'}
                              </button>
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setFurtherDetailsStore(s)}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                                >
                                  Details
                                </button>
                                {onSelectStoreToManage && (
                                  <button
                                    type="button"
                                    onClick={() => onSelectStoreToManage(s)}
                                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl text-xs shadow-sm transition-all cursor-pointer"
                                  >
                                    Manage
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Cloud Database & System Diagnostics */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Cloud Database & Infrastructure Diagnostics</h3>
                  <p className="text-xs text-slate-500 font-medium">Real-time health status of Firestore sync and browser capabilities</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Firestore Connection</div>
                  <div className="text-sm font-extrabold text-emerald-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    Auto Long-Polling Active
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Web Speech Synthesis</div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {typeof window !== 'undefined' && 'speechSynthesis' in window ? 'Supported (Ready)' : 'Not Supported'}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Camera MediaDevices</div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {typeof navigator !== 'undefined' && navigator.mediaDevices ? 'Supported (Ready)' : 'Manual Fallback'}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Managed Records</div>
                  <div className="text-sm font-extrabold text-orange-600">
                    {stores.length} Stores • {users.length} Users
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 7: REAL-TIME DATABASE USAGE */}
        {activeTab === 'database_usage' && (
          <RealTimeDatabaseUsage stores={stores} users={uniqueUsers} />
        )}

      </div>

      {/* MODAL 1: FURTHER DETAILS FOR A STORE */}
      {furtherDetailsStore && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full p-5 sm:p-8 shadow-2xl space-y-6 relative my-auto max-h-[92vh] overflow-y-auto overscroll-contain custom-scrollbar">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 sticky top-0 bg-white z-10">
              <div>
                <span className="text-xs font-bold text-orange-600 uppercase tracking-wider bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200">
                  Store Security Matrix Breakdown
                </span>
                <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2 mt-1">
                  <Building2 className="w-6 h-6 text-orange-600" /> {furtherDetailsStore.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Store Admin Username: <span className="font-mono text-slate-900 font-bold">{furtherDetailsStore.adminUsername}</span>
                </p>
              </div>

              <button
                onClick={() => setFurtherDetailsStore(null)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* SUPER ADMIN HARDWARE & CAMERA SCANNER CONFIGURATION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Inbuilt Camera Barcode Scanner Policy */}
              <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-2xl flex flex-col justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl shrink-0">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-purple-950">Inbuilt Barcode Camera Scanner</h4>
                    <p className="text-xs text-purple-800/80 font-medium mt-0.5">
                      {furtherDetailsStore.cameraScannerEnabled !== false 
                        ? 'Camera scanning is ENABLED for checkout cashiers in this store.' 
                        : 'Camera scanning is DISABLED for this store (External hardware scanner only).'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleCameraScanner(furtherDetailsStore)}
                  disabled={loading}
                  className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    furtherDetailsStore.cameraScannerEnabled !== false
                      ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-500 shadow-sm'
                      : 'bg-white text-purple-800 border-purple-300 hover:bg-purple-50'
                  }`}
                >
                  {furtherDetailsStore.cameraScannerEnabled !== false ? (
                    <>
                      <ToggleRight className="w-4 h-4 text-white" />
                      <span>Camera: Enabled (Click to Disable)</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-4 h-4 text-purple-400" />
                      <span>Camera: Disabled (Click to Enable)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Super Admin Voice Generation Policy */}
              <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl flex flex-col justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl shrink-0">
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-emerald-950">Audio Voice Generation Policy</h4>
                    <p className="text-xs text-emerald-800/80 font-medium mt-0.5">
                      {furtherDetailsStore.voiceAnnouncementEnabled !== false 
                        ? 'Speech announcements for checkout bill amounts & greetings are ALLOWED.' 
                        : 'Voice generation is DISALLOWED & MUTED for all counters in this store.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleVoiceAnnouncement(furtherDetailsStore)}
                  disabled={loading}
                  className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    furtherDetailsStore.voiceAnnouncementEnabled !== false
                      ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500 shadow-sm'
                      : 'bg-white text-rose-800 border-rose-300 hover:bg-rose-50'
                  }`}
                >
                  {furtherDetailsStore.voiceAnnouncementEnabled !== false ? (
                    <>
                      <ToggleRight className="w-4 h-4 text-white" />
                      <span>Voice: Allowed (Click to Disallow)</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-4 h-4 text-rose-400" />
                      <span>Voice: Disallowed (Click to Allow)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* SECTION A: ALL PRODUCT REGISTERS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-blue-600" />
                  Product Registers ({users.filter(u => u.storeId === furtherDetailsStore.id && u.role === 'product_register').length})
                </h4>
                <span className="text-xs text-slate-500 font-medium">Full Credentials Matrix</span>
              </div>

              {users.filter(u => u.storeId === furtherDetailsStore.id && u.role === 'product_register').length === 0 ? (
                <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-xs text-slate-500 text-center font-medium">
                  No product registers registered for this store yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {users.filter(u => u.storeId === furtherDetailsStore.id && u.role === 'product_register').map((pr) => {
                    const isVisible = showUserPasswordId === pr.id;

                    return (
                      <div key={pr.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-sm">{pr.name}</span>
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                              Stock Register
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs mt-1 font-medium text-slate-600">
                            <span>Username: <strong className="text-orange-600 font-mono">{pr.username}</strong></span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              Password: <strong className="text-slate-900 font-mono">{isVisible ? (pr.password || '••••••••') : '••••••••'}</strong>
                              <button
                                onClick={() => setShowUserPasswordId(isVisible ? null : pr.id)}
                                className="text-slate-500 hover:text-slate-800 p-0.5 ml-1"
                                title="Toggle Password"
                              >
                                {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setResetUserModal(pr)}
                            className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-xl cursor-pointer"
                          >
                            Reset Password
                          </button>
                          <button
                            onClick={() => setUserToDelete(pr)}
                            className="px-3 py-1.5 text-xs font-bold text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-xl cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION B: ALL CASHIERS / CASH COUNTERS */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-emerald-600" />
                  Cashiers & Cash Counters ({users.filter(u => u.storeId === furtherDetailsStore.id && u.role === 'cash_counter').length})
                </h4>
                <span className="text-xs text-slate-500 font-medium">Cash Counter Credentials Matrix</span>
              </div>

              {users.filter(u => u.storeId === furtherDetailsStore.id && u.role === 'cash_counter').length === 0 ? (
                <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-xs text-slate-500 text-center font-medium">
                  No cash counters registered for this store yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {users.filter(u => u.storeId === furtherDetailsStore.id && u.role === 'cash_counter').map((cc) => {
                    const isVisible = showUserPasswordId === cc.id;

                    return (
                      <div key={cc.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-sm">{cc.name}</span>
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                              Counter #{cc.counterNumber || '1'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs mt-1 font-medium text-slate-600">
                            <span>Username: <strong className="text-orange-600 font-mono">{cc.username}</strong></span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              Password: <strong className="text-slate-900 font-mono">{isVisible ? (cc.password || '••••••••') : '••••••••'}</strong>
                              <button
                                onClick={() => setShowUserPasswordId(isVisible ? null : cc.id)}
                                className="text-slate-500 hover:text-slate-800 p-0.5 ml-1"
                                title="Toggle Password"
                              >
                                {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setResetUserModal(cc)}
                            className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-xl cursor-pointer"
                          >
                            Reset Password
                          </button>
                          <button
                            onClick={() => setUserToDelete(cc)}
                            className="px-3 py-1.5 text-xs font-bold text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-xl cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setFurtherDetailsStore(null)}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm"
              >
                Close Further Details
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 2: RESET STORE ADMIN PASSWORD */}
      {resetStoreModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6 relative">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" /> Reset Store Admin Password
              </h3>
              <button
                onClick={() => setResetStoreModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-slate-700 font-semibold">
                Store: <span className="text-orange-600">{resetStoreModal.name}</span>
              </p>
              <p className="text-xs text-slate-500 font-medium">
                Admin Username: <span className="font-mono text-slate-900 font-bold">{resetStoreModal.adminUsername}</span>
              </p>
            </div>

            <form onSubmit={handleResetStorePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Admin Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter new password"
                  value={newStorePassword}
                  onChange={(e) => setNewStorePassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetStoreModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                >
                  {loading ? 'Updating...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RESET SUB-USER PASSWORD (CASHIER / REGISTRAR) */}
      {resetUserModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6 relative">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" /> Reset User Password
              </h3>
              <button
                onClick={() => setResetUserModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1 text-xs text-slate-600">
              <p className="font-bold text-slate-900 text-sm">{resetUserModal.name}</p>
              <p>Username: <span className="font-mono text-orange-600 font-bold">{resetUserModal.username}</span></p>
              <p>Role: <span className="font-semibold text-slate-800 uppercase">{resetUserModal.role}</span></p>
            </div>

            <form onSubmit={handleResetUserPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter new password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetUserModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                >
                  {loading ? 'Updating...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE STORE CONFIRMATION */}
      {storeToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-red-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6 relative">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" /> Confirm Delete Store
              </h3>
              <button
                onClick={() => setStoreToDelete(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-700">
              <p>
                Are you sure you want to delete <span className="font-extrabold text-slate-900">{storeToDelete.name}</span>?
              </p>
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1 font-medium">
                <p className="font-bold">⚠️ Warning:</p>
                <p>Deleting this store will permanently remove the store record and all associated cashier / store admin accounts from the system.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStoreToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteStore}
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md shadow-red-600/20 transition-all cursor-pointer"
              >
                {loading ? 'Deleting...' : 'Delete Store Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: DELETE SUB-USER CONFIRMATION */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-red-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6 relative">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" /> Confirm Delete Account
              </h3>
              <button
                onClick={() => setUserToDelete(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-700 font-medium">
              <p>
                Delete account <span className="font-extrabold text-slate-900">{userToDelete.name}</span> (<span className="font-mono text-orange-600">{userToDelete.username}</span>)?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUserAccount}
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md shadow-red-600/20 transition-all cursor-pointer"
              >
                {loading ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: DEDICATED CREATE BRANCH ADMIN ACCOUNT UNDER STORE */}
      {createBranchModalStore && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-orange-600" /> Create Branch Admin Account
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Provision a new regional branch location under <strong className="text-slate-800">{createBranchModalStore.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setCreateBranchModalStore(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleModalCreateBranchAdmin} className="space-y-4">
              {/* Parent Chain Store */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Parent Main Store (Fixed)
                </label>
                <input
                  type="text"
                  disabled
                  value={`${createBranchModalStore.name} (@${createBranchModalStore.adminUsername})`}
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 font-bold text-xs cursor-not-allowed"
                />
              </div>

              {/* Branch Name & Code */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Branch Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Downtown Branch"
                    value={modalBranchName}
                    onChange={(e) => setModalBranchName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Branch Code
                  </label>
                  <input
                    type="text"
                    placeholder="BR-01"
                    value={modalBranchCode}
                    onChange={(e) => setModalBranchCode(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-mono font-bold focus:outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Branch Admin Username & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Branch Admin Username *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. downtown_admin"
                    value={modalBranchAdminUsername}
                    onChange={(e) => setModalBranchAdminUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-mono font-medium focus:outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Branch Admin Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={modalBranchAdminPassword}
                    onChange={(e) => setModalBranchAdminPassword(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Branch Admin Salary & Administrative Overhead */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/50 rounded-2xl border border-amber-200">
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 uppercase tracking-wider mb-1">
                    Branch Admin Salary (Rs.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 70000"
                    value={modalBranchAdminSalary}
                    onChange={(e) => setModalBranchAdminSalary(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-slate-900 text-xs font-bold font-mono focus:outline-none focus:border-orange-500"
                  />
                  <span className="text-[10px] text-amber-700 font-medium">Set by Store/Super Admin (Branch Admin cannot edit own)</span>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 uppercase tracking-wider mb-1">
                    Administrative Overhead (Rs.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 15000"
                    value={modalBranchAdminOverhead}
                    onChange={(e) => setModalBranchAdminOverhead(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-slate-900 text-xs font-bold font-mono focus:outline-none focus:border-orange-500"
                  />
                  <span className="text-[10px] text-amber-700 font-medium">Rent, utilities, licenses overhead</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateBranchModalStore(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-600/20 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Building2 className="w-4 h-4" />
                  <span>{loading ? 'Creating...' : 'Create Branch Admin Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: DEDICATED CREATE SUB-ACCOUNT DIRECTLY UNDER BRANCH */}
      {createBranchAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-orange-600" />
                  Create {createBranchAccountModal.accountType.replace('_', ' ').toUpperCase()} Account
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Branch: <strong className="text-slate-800">{createBranchAccountModal.branch.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setCreateBranchAccountModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleModalCreateBranchSubAccount} className="space-y-4">
              {/* Branch locked */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Assigned Branch
                </label>
                <input
                  type="text"
                  disabled
                  value={`${createBranchAccountModal.branch.name} (${createBranchAccountModal.branch.branchCode || 'BR'})`}
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 font-bold text-xs cursor-not-allowed"
                />
              </div>

              {/* Staff Role Selector (if staff type) */}
              {createBranchAccountModal.accountType === 'staff' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Specific Role
                  </label>
                  <select
                    value={modalStaffRole}
                    onChange={(e) => setModalStaffRole(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white"
                  >
                    <option value="staff">General Floor Staff</option>
                    <option value="inventory_manager">Inventory & Warehouse Manager</option>
                  </select>
                </div>
              )}

              {/* Counter Number (if cash counter) */}
              {createBranchAccountModal.accountType === 'cash_counter' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    POS Counter Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="1, 2, 3..."
                    value={modalAccountCounterNum}
                    onChange={(e) => setModalAccountCounterNum(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-bold font-mono focus:outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name / Counter Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Counter 1 Cashier / John Staff"
                  value={modalAccountName}
                  onChange={(e) => setModalAccountName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500 focus:bg-white"
                />
              </div>

              {/* Username & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Login Username *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="username"
                    value={modalAccountUsername}
                    onChange={(e) => setModalAccountUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-mono font-medium focus:outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Login Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={modalAccountPassword}
                    onChange={(e) => setModalAccountPassword(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Staff Monthly Base Salary */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Monthly Base Salary (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 35000"
                  value={modalAccountSalary}
                  onChange={(e) => setModalAccountSalary(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-mono font-bold focus:outline-none focus:border-orange-500 focus:bg-white"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Staff salary can be entered by Branch Admin or Store Admin and will be deducted from branch net profit.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateBranchAccountModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-600/20 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{loading ? 'Creating...' : 'Create Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
