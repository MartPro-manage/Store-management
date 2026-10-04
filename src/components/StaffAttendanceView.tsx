import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  CalendarCheck2, 
  Clock, 
  LogIn, 
  LogOut, 
  Calendar, 
  UserCheck, 
  UserX, 
  Users, 
  Search, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  PlusCircle, 
  Trash2, 
  Edit3, 
  ShieldCheck, 
  Calculator, 
  PackageCheck, 
  ScanLine, 
  TrendingUp, 
  RefreshCw, 
  Sun, 
  Moon, 
  Coffee,
  Check,
  X
} from 'lucide-react';
import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  handleFirestoreError, 
  OperationType 
} from '../lib/firebase';
import { Store, UserAccount, StaffAttendanceRecord, UserRole } from '../types';
import { speakMessage } from '../lib/speech';
import { playScanSuccessBeep } from '../lib/sound';

interface StaffAttendanceViewProps {
  store: Store;
  currentUser: UserAccount;
  storeUsers?: UserAccount[];
  onBack?: () => void;
}

export const StaffAttendanceView: React.FC<StaffAttendanceViewProps> = ({
  store,
  currentUser,
  storeUsers = [],
  onBack
}) => {
  const isStoreAdmin = currentUser.role === 'store_admin' || currentUser.role === 'admin' || currentUser.role === 'branch_admin' || currentUser.role === 'super_admin';

  // State
  const [activeTab, setActiveTab] = useState<'mark' | 'reports'>('mark');
  const [attendanceRecords, setAttendanceRecords] = useState<StaffAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayDateStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const currentMonthStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  // Filter States for Admin Reports
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Attendance Marking Form State
  const [markingNotes, setMarkingNotes] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<'morning' | 'evening' | 'full_day'>('morning');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Admin Manual Attendance Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualStaffId, setManualStaffId] = useState<string>(currentUser.id);
  const [manualDate, setManualDate] = useState<string>(todayDateStr);
  const [manualStatus, setManualStatus] = useState<StaffAttendanceRecord['status']>('present');
  const [manualCheckIn, setManualCheckIn] = useState<string>('09:00 AM');
  const [manualCheckOut, setManualCheckOut] = useState<string>('06:00 PM');
  const [manualNotes, setManualNotes] = useState<string>('Admin Recorded');

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  // Real-time synchronization of Staff Attendance
  useEffect(() => {
    if (!store?.id) return;
    setLoading(true);

    const q = query(
      collection(db, 'staff_attendance'),
      where('storeId', '==', store.id)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: StaffAttendanceRecord[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as StaffAttendanceRecord);
        });
        // Sort newest date & timestamp first
        list.sort((a, b) => new Date(b.timestamp || b.date).getTime() - new Date(a.timestamp || a.date).getTime());
        setAttendanceRecords(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching attendance records:', err);
        handleFirestoreError(err, OperationType.GET, 'staff_attendance');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [store?.id]);

  // Filtered staff users (all staff except store admin / admin / branch admin)
  const eligibleStaffUsers = useMemo(() => {
    return storeUsers.filter(u => u.role !== 'store_admin' && u.role !== 'admin' && u.role !== 'branch_admin' && u.role !== 'super_admin');
  }, [storeUsers]);
  const myTodayRecord = useMemo(() => {
    return attendanceRecords.find(
      (r) => r.staffId === currentUser.id && r.date === todayDateStr
    );
  }, [attendanceRecords, currentUser.id, todayDateStr]);

  // Format time string
  const formatTimeNow = () => {
    return currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  // Calculate working hours between two formatted time strings
  const computeHoursDifference = (inTimeStr?: string, outTimeStr?: string): number => {
    if (!inTimeStr || !outTimeStr) return 0;
    try {
      const parseTimeString = (t: string) => {
        const [timePart, meridiem] = t.split(' ');
        const [h, m] = timePart.split(':').map(Number);
        let hours = h;
        if (meridiem?.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (meridiem?.toUpperCase() === 'AM' && hours === 12) hours = 0;
        return hours * 60 + (m || 0);
      };
      const inMins = parseTimeString(inTimeStr);
      const outMins = parseTimeString(outTimeStr);
      const diffMins = Math.max(0, outMins - inMins);
      return Math.round((diffMins / 60) * 10) / 10;
    } catch {
      return 0;
    }
  };

  // Mark Check-In
  const handleMarkCheckIn = async () => {
    if (!store?.id || !currentUser?.id) return;
    setIsSubmitting(true);
    const nowFormattedTime = formatTimeNow();
    const nowIso = new Date().toISOString();

    try {
      if (myTodayRecord) {
        // Update existing record
        await updateDoc(doc(db, 'staff_attendance', myTodayRecord.id), {
          checkInTime: nowFormattedTime,
          status: 'present',
          notes: markingNotes.trim() ? `${markingNotes} (${selectedShift})` : `Checked in (${selectedShift})`,
          timestamp: nowIso
        });
      } else {
        // Create new record for today
        await addDoc(collection(db, 'staff_attendance'), {
          storeId: store.id,
          parentStoreId: store.parentStoreId || store.id,
          staffId: currentUser.id,
          staffName: currentUser.name || currentUser.username,
          staffUsername: currentUser.username,
          staffRole: currentUser.role,
          date: todayDateStr,
          status: 'present',
          checkInTime: nowFormattedTime,
          checkOutTime: '',
          workingHours: 0,
          notes: markingNotes.trim() ? `${markingNotes} (${selectedShift})` : `Checked in (${selectedShift})`,
          markedByUsername: currentUser.username,
          markedByRole: currentUser.role,
          timestamp: nowIso
        });
      }

      playScanSuccessBeep();
      speakMessage(`Attendance check in marked. Welcome ${currentUser.name || currentUser.username}!`);
      showNotification('success', `Check-In recorded at ${nowFormattedTime}`);
      setMarkingNotes('');
    } catch (err: any) {
      console.error('Check-in error:', err);
      showNotification('error', `Failed to mark check-in: ${err?.message || 'Error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mark Check-Out
  const handleMarkCheckOut = async () => {
    if (!store?.id || !currentUser?.id || !myTodayRecord) return;
    setIsSubmitting(true);
    const nowFormattedTime = formatTimeNow();
    const nowIso = new Date().toISOString();
    const hours = computeHoursDifference(myTodayRecord.checkInTime, nowFormattedTime);

    try {
      await updateDoc(doc(db, 'staff_attendance', myTodayRecord.id), {
        checkOutTime: nowFormattedTime,
        workingHours: hours,
        timestamp: nowIso
      });

      playScanSuccessBeep();
      speakMessage(`Check out recorded. Total working time is ${hours} hours. Have a great day!`);
      showNotification('success', `Check-Out recorded at ${nowFormattedTime} (${hours} hrs)`);
    } catch (err: any) {
      console.error('Check-out error:', err);
      showNotification('error', `Failed to mark check-out: ${err?.message || 'Error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mark Leave / Absent
  const handleMarkLeave = async (type: 'leave' | 'half_day') => {
    if (!store?.id || !currentUser?.id) return;
    setIsSubmitting(true);
    const nowIso = new Date().toISOString();
    const statusLabel = type === 'leave' ? 'On Leave' : 'Half Day';

    try {
      if (myTodayRecord) {
        await updateDoc(doc(db, 'staff_attendance', myTodayRecord.id), {
          status: type,
          notes: markingNotes.trim() || statusLabel,
          timestamp: nowIso
        });
      } else {
        await addDoc(collection(db, 'staff_attendance'), {
          storeId: store.id,
          parentStoreId: store.parentStoreId || store.id,
          staffId: currentUser.id,
          staffName: currentUser.name || currentUser.username,
          staffUsername: currentUser.username,
          staffRole: currentUser.role,
          date: todayDateStr,
          status: type,
          checkInTime: '',
          checkOutTime: '',
          workingHours: type === 'half_day' ? 4 : 0,
          notes: markingNotes.trim() || statusLabel,
          markedByUsername: currentUser.username,
          markedByRole: currentUser.role,
          timestamp: nowIso
        });
      }

      showNotification('success', `Marked as ${statusLabel} for today.`);
      setMarkingNotes('');
    } catch (err: any) {
      console.error('Leave mark error:', err);
      showNotification('error', `Failed to record leave: ${err?.message || 'Error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Admin: Save Manual Attendance Entry
  const handleSaveManualAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store?.id) return;
    setIsSubmitting(true);

    const targetUser = storeUsers.find(u => u.id === manualStaffId) || currentUser;
    const hours = computeHoursDifference(manualCheckIn, manualCheckOut);
    const nowIso = new Date().toISOString();

    try {
      // Check if existing record for this staff and date
      const existing = attendanceRecords.find(r => r.staffId === targetUser.id && r.date === manualDate);
      if (existing) {
        await updateDoc(doc(db, 'staff_attendance', existing.id), {
          status: manualStatus,
          checkInTime: manualCheckIn,
          checkOutTime: manualCheckOut,
          workingHours: hours,
          notes: manualNotes,
          markedByUsername: `${currentUser.username} (Admin)`,
          timestamp: nowIso
        });
        showNotification('success', `Updated attendance record for ${targetUser.name || targetUser.username}`);
      } else {
        await addDoc(collection(db, 'staff_attendance'), {
          storeId: store.id,
          parentStoreId: store.parentStoreId || store.id,
          staffId: targetUser.id,
          staffName: targetUser.name || targetUser.username,
          staffUsername: targetUser.username,
          staffRole: targetUser.role,
          date: manualDate,
          status: manualStatus,
          checkInTime: manualCheckIn,
          checkOutTime: manualCheckOut,
          workingHours: hours,
          notes: manualNotes,
          markedByUsername: `${currentUser.username} (Admin)`,
          markedByRole: currentUser.role,
          timestamp: nowIso
        });
        showNotification('success', `Created attendance record for ${targetUser.name || targetUser.username}`);
      }

      setIsManualModalOpen(false);
    } catch (err: any) {
      console.error('Manual attendance error:', err);
      showNotification('error', `Failed to save record: ${err?.message || 'Error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Admin: Delete Attendance Record
  const handleDeleteRecord = async (id: string, staffName: string) => {
    if (!window.confirm(`Are you sure you want to delete this attendance record for ${staffName}?`)) return;
    try {
      await deleteDoc(doc(db, 'staff_attendance', id));
      showNotification('success', 'Attendance record deleted.');
    } catch (err: any) {
      showNotification('error', 'Failed to delete record.');
    }
  };

  // Filtered Attendance List for Custom Month & Staff Selection
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter((r) => {
      // 1. Month Filter (YYYY-MM)
      if (selectedMonth && !r.date.startsWith(selectedMonth)) {
        return false;
      }

      // 2. Specific Staff Filter
      if (selectedStaffId !== 'all' && r.staffId !== selectedStaffId) {
        return false;
      }

      // 3. Status Filter
      if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }

      // 4. Search Keyword
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase();
        const matchesName = (r.staffName || '').toLowerCase().includes(q);
        const matchesUsername = (r.staffUsername || '').toLowerCase().includes(q);
        const matchesRole = (r.staffRole || '').toLowerCase().includes(q);
        const matchesNotes = (r.notes || '').toLowerCase().includes(q);
        const matchesDate = (r.date || '').toLowerCase().includes(q);
        if (!matchesName && !matchesUsername && !matchesRole && !matchesNotes && !matchesDate) return false;
      }

      return true;
    });
  }, [attendanceRecords, selectedMonth, selectedStaffId, statusFilter, searchKeyword]);

  // Monthly Metrics for Selected Staff & Month
  const reportMetrics = useMemo(() => {
    const totalEntries = filteredRecords.length;
    const presentCount = filteredRecords.filter(r => r.status === 'present').length;
    const lateCount = filteredRecords.filter(r => r.status === 'late').length;
    const halfDayCount = filteredRecords.filter(r => r.status === 'half_day').length;
    const leaveCount = filteredRecords.filter(r => r.status === 'leave' || r.status === 'absent').length;
    
    const totalWorkingHours = filteredRecords.reduce((acc, r) => acc + (r.workingHours || 0), 0);

    return {
      totalEntries,
      presentCount,
      lateCount,
      halfDayCount,
      leaveCount,
      totalWorkingHours: Math.round(totalWorkingHours * 10) / 10
    };
  }, [filteredRecords]);

  // Export Attendance Report to .xlsx
  const handleExportAttendanceXlsx = () => {
    const staffLabel = selectedStaffId === 'all' 
      ? 'All_Staff' 
      : (storeUsers.find(u => u.id === selectedStaffId)?.username || 'Staff');

    const formattedData = filteredRecords.map((r, idx) => ({
      'S.No': idx + 1,
      'Date': r.date,
      'Staff Name': r.staffName || r.staffUsername,
      'Username': r.staffUsername,
      'Role': r.staffRole ? r.staffRole.replace(/_/g, ' ').toUpperCase() : 'STAFF',
      'Status': r.status ? r.status.toUpperCase() : 'PRESENT',
      'Check-In Time': r.checkInTime || '-',
      'Check-Out Time': r.checkOutTime || '-',
      'Working Hours': r.workingHours ? `${r.workingHours} hrs` : '-',
      'Notes / Shift': r.notes || '-',
      'Recorded By': r.markedByUsername || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');

    // Auto-fit column widths
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 24 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 28 },
      { wch: 18 }
    ];

    const fileName = `Attendance_Report_${store.name.replace(/\s+/g, '_')}_${staffLabel}_${selectedMonth}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showNotification('success', `Exported ${formattedData.length} records to ${fileName}`);
  };

  // Helper for role badge
  const renderRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
      case 'store_admin':
        return (
          <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-extrabold uppercase flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-orange-600" /> Admin
          </span>
        );
      case 'cash_counter':
        return (
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold uppercase flex items-center gap-1">
            <Calculator className="w-3 h-3 text-emerald-600" /> Cashier
          </span>
        );
      case 'product_register':
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-extrabold uppercase flex items-center gap-1">
            <PackageCheck className="w-3 h-3 text-blue-600" /> Inventory
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-extrabold uppercase">
            {role ? String(role).replace(/_/g, ' ') : 'Staff'}
          </span>
        );
    }
  };

  // Helper for status badge
  const renderStatusBadge = (status: StaffAttendanceRecord['status']) => {
    switch (status) {
      case 'present':
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black uppercase flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> Present
          </span>
        );
      case 'late':
        return (
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-xs font-black uppercase flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" /> Late
          </span>
        );
      case 'half_day':
        return (
          <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 text-xs font-black uppercase flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" /> Half Day
          </span>
        );
      case 'leave':
      case 'absent':
        return (
          <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-black uppercase flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" /> Leave / Absent
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6 select-none animate-fade-in pb-16">
      
      {/* Top Banner with Real-time Clock & View Switcher */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 sm:p-6 rounded-3xl shadow-xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1.5">
              <CalendarCheck2 className="w-3.5 h-3.5 text-orange-400" />
              Staff Attendance Hub
            </span>
            <span className="text-xs text-slate-400 font-bold">• {store.name}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Daily Attendance & Monthly Reports
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-xl">
            Mark daily check-in / check-out with automatic live timestamps, or generate monthly attendance reports by staff member.
          </p>
        </div>

        {/* Live Digital Clock */}
        <div className="relative z-10 bg-slate-950/70 border border-slate-700 p-4 rounded-2xl flex flex-col items-center justify-center shrink-0 min-w-[200px] shadow-inner">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 animate-pulse text-orange-400" /> Live System Time
          </div>
          <div className="text-xl sm:text-2xl font-mono font-black text-white tracking-wider my-0.5">
            {formatTimeNow()}
          </div>
          <div className="text-xs text-slate-400 font-medium">
            {currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('mark')}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'mark'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Mark Daily Attendance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'reports'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Attendance Reports (Custom Month)</span>
          </button>
        </div>

        {activeTab === 'reports' && (
          <div className="flex items-center gap-2 flex-wrap">
            {isStoreAdmin && (
              <button
                type="button"
                onClick={() => setIsManualModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <PlusCircle className="w-3.5 h-3.5 text-orange-400" />
                <span>Admin Entry</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportAttendanceXlsx}
              disabled={filteredRecords.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all disabled:opacity-50"
              title="Download filtered monthly attendance report as .xlsx spreadsheet"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download .xlsx Report</span>
            </button>
          </div>
        )}
      </div>

      {/* Notifications */}
      {msg && (
        <div className={`p-4 rounded-2xl border flex items-center gap-3 text-xs sm:text-sm font-bold shadow-sm transition-all ${
          msg.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          {msg.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: MARK DAILY ATTENDANCE (STAFF & ADMIN) */}
      {/* ======================================================== */}
      {activeTab === 'mark' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* User Profile Card & Attendance Status */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              
              {/* Profile Header */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white font-black text-xl flex items-center justify-center shadow-lg shadow-orange-500/30 shrink-0">
                  {(currentUser.name || currentUser.username).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 truncate">
                      {currentUser.name || currentUser.username}
                    </h3>
                  </div>
                  <div className="text-xs text-slate-500 font-medium">@{currentUser.username}</div>
                  <div className="mt-1 flex items-center gap-2">
                    {renderRoleBadge(currentUser.role)}
                    {currentUser.counterNumber && (
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        Counter #{currentUser.counterNumber}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5 space-y-3">
                <div className="text-xs font-black text-slate-400 uppercase tracking-wider">
                  Today's Status ({todayDateStr})
                </div>

                {myTodayRecord ? (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">Attendance Status:</span>
                      {renderStatusBadge(myTodayRecord.status)}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                      <div>
                        <span className="text-[11px] text-slate-500 font-bold block">Check In:</span>
                        <span className="text-sm font-mono font-black text-emerald-700">
                          {myTodayRecord.checkInTime || 'Not checked in'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 font-bold block">Check Out:</span>
                        <span className="text-sm font-mono font-black text-blue-700">
                          {myTodayRecord.checkOutTime || 'In Progress'}
                        </span>
                      </div>
                    </div>

                    {myTodayRecord.workingHours !== undefined && myTodayRecord.workingHours > 0 && (
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-center text-xs font-bold text-slate-800">
                        Total Time Worked: <span className="text-orange-600 font-mono font-black">{myTodayRecord.workingHours} Hours</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>You have not marked attendance yet for today.</span>
                  </div>
                )}
              </div>

            </div>

            {/* Quick Shift Selection */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                Select Your Shift & Notes
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedShift('morning')}
                  className={`p-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer border ${
                    selectedShift === 'morning'
                      ? 'bg-orange-50 border-orange-300 text-orange-900 font-black shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>Morning</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedShift('evening')}
                  className={`p-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer border ${
                    selectedShift === 'evening'
                      ? 'bg-orange-50 border-orange-300 text-orange-900 font-black shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Moon className="w-4 h-4 text-indigo-500" />
                  <span>Evening</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedShift('full_day')}
                  className={`p-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer border ${
                    selectedShift === 'full_day'
                      ? 'bg-orange-50 border-orange-300 text-orange-900 font-black shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Coffee className="w-4 h-4 text-emerald-600" />
                  <span>Full Day</span>
                </button>
              </div>

              <input
                type="text"
                value={markingNotes}
                onChange={(e) => setMarkingNotes(e.target.value)}
                placeholder="Optional notes / reason / counter info..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Action Trigger Pad */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <CalendarCheck2 className="w-5 h-5 text-orange-600" />
                  Attendance Actions
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Click the button below to register your check-in or check-out with automatic live timestamp verification.
                </p>
              </div>

              {/* Check-In / Check-Out Main Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* CHECK IN BUTTON */}
                <button
                  type="button"
                  onClick={handleMarkCheckIn}
                  disabled={isSubmitting || (Boolean(myTodayRecord?.checkInTime) && !myTodayRecord?.checkOutTime)}
                  className={`p-6 rounded-3xl border text-left transition-all flex flex-col justify-between min-h-[140px] shadow-sm cursor-pointer ${
                    myTodayRecord?.checkInTime 
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950 opacity-75' 
                      : 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white hover:from-emerald-500 hover:to-teal-600 shadow-emerald-600/30 hover:scale-[1.01]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-xs text-white">
                      <LogIn className="w-6 h-6" />
                    </div>
                    {myTodayRecord?.checkInTime && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                        Checked In
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-base font-black uppercase tracking-wider">
                      {myTodayRecord?.checkInTime ? 'Check-In Completed' : '🟢 Mark Check-In'}
                    </div>
                    <div className="text-xs opacity-90 font-medium mt-0.5">
                      {myTodayRecord?.checkInTime ? `Recorded at ${myTodayRecord.checkInTime}` : `Click to record arrival at ${formatTimeNow()}`}
                    </div>
                  </div>
                </button>

                {/* CHECK OUT BUTTON */}
                <button
                  type="button"
                  onClick={handleMarkCheckOut}
                  disabled={isSubmitting || !myTodayRecord?.checkInTime || Boolean(myTodayRecord?.checkOutTime)}
                  className={`p-6 rounded-3xl border text-left transition-all flex flex-col justify-between min-h-[140px] shadow-sm cursor-pointer ${
                    myTodayRecord?.checkOutTime
                      ? 'bg-blue-50/60 border-blue-200 text-blue-950 opacity-75'
                      : !myTodayRecord?.checkInTime
                      ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'
                      : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white hover:from-blue-500 hover:to-indigo-600 shadow-blue-600/30 hover:scale-[1.01]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-xs text-white">
                      <LogOut className="w-6 h-6" />
                    </div>
                    {myTodayRecord?.checkOutTime && (
                      <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase">
                        Completed
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-base font-black uppercase tracking-wider">
                      {myTodayRecord?.checkOutTime ? 'Check-Out Completed' : '🔴 Mark Check-Out'}
                    </div>
                    <div className="text-xs opacity-90 font-medium mt-0.5">
                      {myTodayRecord?.checkOutTime 
                        ? `Recorded at ${myTodayRecord.checkOutTime}` 
                        : myTodayRecord?.checkInTime 
                        ? `Click to finish shift at ${formatTimeNow()}`
                        : 'Requires check-in first'}
                    </div>
                  </div>
                </button>

              </div>

              {/* Permission / Half Day Options */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <div className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  Other Daily Options
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleMarkLeave('half_day')}
                    disabled={isSubmitting}
                    className="p-3.5 rounded-2xl bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-900 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Coffee className="w-4 h-4 text-indigo-600" />
                    <span>Request Half Day</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMarkLeave('leave')}
                    disabled={isSubmitting}
                    className="p-3.5 rounded-2xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-900 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <UserX className="w-4 h-4 text-rose-600" />
                    <span>Mark On Leave / Off</span>
                  </button>
                </div>
              </div>

            </div>

            {/* My Recent Attendance History (Last 5 Days) */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  My Recent Attendance History
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStaffId(currentUser.id);
                    setActiveTab('reports');
                  }}
                  className="text-xs font-bold text-orange-600 hover:underline"
                >
                  View Full Monthly Report →
                </button>
              </div>

              <div className="space-y-2">
                {attendanceRecords.filter(r => r.staffId === currentUser.id).slice(0, 5).map((rec) => (
                  <div key={rec.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-800">{rec.date}</span>
                      <span className="text-slate-400 mx-2">•</span>
                      <span className="text-slate-600">{rec.checkInTime || '-'} to {rec.checkOutTime || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {rec.workingHours ? <span className="font-mono font-bold text-slate-700">{rec.workingHours}h</span> : null}
                      {renderStatusBadge(rec.status)}
                    </div>
                  </div>
                ))}
                {attendanceRecords.filter(r => r.staffId === currentUser.id).length === 0 && (
                  <div className="text-center py-4 text-xs text-slate-400 font-medium">
                    No attendance logs recorded yet.
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: ATTENDANCE REPORTS BY CUSTOM MONTH & SPECIFIC STAFF */}
      {/* ======================================================== */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          
          {/* Filter Bar (Custom Month, Specific Staff, Status, Search) */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-orange-600" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Attendance Report Filters
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Showing {filteredRecords.length} records for <span className="font-bold text-slate-900">{selectedMonth}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              {/* 1. CUSTOM MONTH SELECTOR */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Custom Month (YYYY-MM)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedMonth(currentMonthStr)}
                    className="px-2 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold shrink-0"
                    title="Current Month"
                  >
                    Current
                  </button>
                </div>
              </div>

              {/* 2. SPECIFIC STAFF MEMBER SELECTOR */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Specific Staff Member
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">All Staff Members ({eligibleStaffUsers.length})</option>
                  {eligibleStaffUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.username} ({u.role ? u.role.replace(/_/g, ' ') : 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. STATUS FILTER */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Attendance Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="half_day">Half Day</option>
                  <option value="leave">Leave / Absent</option>
                </select>
              </div>

              {/* 4. KEYWORD SEARCH */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Search Record
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Search name, notes..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Metric Summary Cards for Selected Month & Staff */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Total Days Logged</span>
              <div className="text-xl font-black text-slate-900 font-mono">
                {reportMetrics.totalEntries}
              </div>
              <span className="text-[10px] text-slate-400 font-medium">In {selectedMonth}</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider">Present Days</span>
              <div className="text-xl font-black text-emerald-700 font-mono">
                {reportMetrics.presentCount}
              </div>
              <span className="text-[10px] text-emerald-600 font-medium">On-time attendance</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider">Late Arrivals</span>
              <div className="text-xl font-black text-amber-700 font-mono">
                {reportMetrics.lateCount}
              </div>
              <span className="text-[10px] text-amber-600 font-medium">Late check-ins</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider">Leaves / Off</span>
              <div className="text-xl font-black text-rose-700 font-mono">
                {reportMetrics.leaveCount}
              </div>
              <span className="text-[10px] text-rose-600 font-medium">Excused & Unexcused</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider">Total Hours Worked</span>
              <div className="text-xl font-black text-blue-700 font-mono">
                {reportMetrics.totalWorkingHours}h
              </div>
              <span className="text-[10px] text-blue-600 font-medium">Accumulated duration</span>
            </div>

          </div>

          {/* Monthly Detailed Day-by-Day Attendance Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <CalendarCheck2 className="w-5 h-5 text-orange-600" />
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Detailed Monthly Attendance Log
                </h3>
              </div>
              <div className="text-xs text-slate-500 font-bold">
                {selectedStaffId === 'all' 
                  ? `All Staff Members • ${selectedMonth}`
                  : `${storeUsers.find(u => u.id === selectedStaffId)?.name || 'Selected Staff'} • ${selectedMonth}`
                }
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Staff Name & Role</th>
                    <th className="py-3 px-4 text-center">Check-In</th>
                    <th className="py-3 px-4 text-center">Check-Out</th>
                    <th className="py-3 px-4 text-center">Hours</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Notes / Shift</th>
                    {isStoreAdmin && <th className="py-3 px-4 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {record.date}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{record.staffName || record.staffUsername}</div>
                          <div className="text-[11px] text-slate-400">@{record.staffUsername}</div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {record.checkInTime || '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-blue-700 whitespace-nowrap">
                          {record.checkOutTime || '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                          {record.workingHours !== undefined && record.workingHours > 0 ? `${record.workingHours}h` : '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {renderStatusBadge(record.status)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-[200px] truncate">
                          {record.notes || '-'}
                        </td>
                        {isStoreAdmin && (
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(record.id, record.staffName || record.staffUsername)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isStoreAdmin ? 8 : 7} className="text-center py-10 text-slate-400 font-medium">
                        No attendance records found for {selectedMonth} with current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* ADMIN MANUAL ATTENDANCE MODAL */}
      {/* ======================================================== */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-fade-in my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-slate-900">Admin Manual Attendance Entry</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualAttendance} className="space-y-4">
              
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Select Staff Member</label>
                <select
                  value={manualStaffId}
                  onChange={(e) => setManualStaffId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                >
                  {eligibleStaffUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.username} (@{u.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Date</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                  >
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="half_day">Half Day</option>
                    <option value="leave">Leave / Absent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Check-In Time</label>
                  <input
                    type="text"
                    value={manualCheckIn}
                    onChange={(e) => setManualCheckIn(e.target.value)}
                    placeholder="e.g. 09:00 AM"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Check-Out Time</label>
                  <input
                    type="text"
                    value={manualCheckOut}
                    onChange={(e) => setManualCheckOut(e.target.value)}
                    placeholder="e.g. 06:00 PM"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Notes / Reason</label>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="e.g. Manual correction, approved shift"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-wider shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
