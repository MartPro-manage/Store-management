import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Activity, 
  Clock, 
  ShieldCheck, 
  Calculator, 
  PackageCheck, 
  UserCheck, 
  UserX, 
  Search, 
  LogIn, 
  CircleDot
} from 'lucide-react';
import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  handleFirestoreError, 
  OperationType 
} from '../lib/firebase';
import { Store, UserAccount, StaffSessionLog, UserRole } from '../types';

interface StoreStaffTrackerViewProps {
  store: Store;
  currentUser: UserAccount;
  storeUsers: UserAccount[];
  onStaffUpdated?: () => void;
}

export const StoreStaffTrackerView: React.FC<StoreStaffTrackerViewProps> = ({
  store,
  currentUser,
  storeUsers
}) => {
  const [sessions, setSessions] = useState<StaffSessionLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [nowTime, setNowTime] = useState(Date.now());

  // Periodically tick every 10 seconds to update live duration displays
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Real-time synchronization of Staff Sessions
  useEffect(() => {
    if (!store?.id) return;

    const q = query(
      collection(db, 'staff_sessions'),
      where('storeId', '==', store.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: StaffSessionLog[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as StaffSessionLog);
      });
      // Sort newest login first
      list.sort((a, b) => new Date(b.loginTime).getTime() - new Date(a.loginTime).getTime());
      setSessions(list);
    }, (err) => {
      console.error('Error listening to staff sessions:', err);
      handleFirestoreError(err, OperationType.GET, 'staff_sessions');
    });

    return () => unsubscribe();
  }, [store?.id]);

  // Format active duration
  const getDurationString = (loginTime: string) => {
    const start = new Date(loginTime).getTime();
    const diffMs = Math.max(0, nowTime - start);
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins} min${mins === 1 ? '' : 's'}`;
  };

  // Map of currently online staff sessions by userId and username
  const onlineSessionMap = useMemo(() => {
    const map = new Map<string, StaffSessionLog>();
    sessions.forEach(s => {
      if (s.status === 'online') {
        if (s.userId) map.set(s.userId, s);
        if (s.username) map.set(s.username.toLowerCase(), s);
      }
    });
    return map;
  }, [sessions]);

  // Combined staff roster with Online/Offline status at current time
  const staffStatusList = useMemo(() => {
    const roster: Array<{
      id: string;
      name: string;
      username: string;
      role: UserRole;
      counterNumber?: string;
      isOnline: boolean;
      loginTime?: string;
      duration?: string;
      lastSeen?: string;
    }> = [];

    const seenKeys = new Set<string>();

    // 1. Process all registered storeUsers
    (storeUsers || []).forEach(u => {
      const key = u.id || u.username.toLowerCase();
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const activeSession = onlineSessionMap.get(u.id) || (u.username ? onlineSessionMap.get(u.username.toLowerCase()) : undefined);
      const isOnline = Boolean(activeSession);

      // Find latest session for last active timestamp if offline
      const userSessions = sessions.filter(s => s.userId === u.id || (u.username && s.username?.toLowerCase() === u.username.toLowerCase()));
      const latestSession = userSessions[0];

      roster.push({
        id: u.id,
        name: u.name || u.username,
        username: u.username,
        role: u.role,
        counterNumber: u.counterNumber || activeSession?.counterNumber,
        isOnline,
        loginTime: activeSession ? activeSession.loginTime : undefined,
        duration: activeSession ? getDurationString(activeSession.loginTime) : undefined,
        lastSeen: !isOnline && latestSession ? (latestSession.logoutTime || latestSession.loginTime) : undefined
      });
    });

    // 2. Also include any currently online session that might not be in storeUsers yet
    sessions.forEach(s => {
      if (s.status === 'online') {
        const key = s.userId || (s.username ? s.username.toLowerCase() : s.id);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          roster.push({
            id: s.userId || s.id,
            name: s.userName || s.username,
            username: s.username,
            role: s.role,
            counterNumber: s.counterNumber,
            isOnline: true,
            loginTime: s.loginTime,
            duration: getDurationString(s.loginTime)
          });
        }
      }
    });

    // Sort: Online staff members first, then alphabetically by name
    roster.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.name.localeCompare(b.name);
    });

    return roster;
  }, [storeUsers, sessions, onlineSessionMap, nowTime]);

  // Online and offline counts at current time
  const onlineCount = useMemo(() => staffStatusList.filter(s => s.isOnline).length, [staffStatusList]);
  const offlineCount = useMemo(() => staffStatusList.filter(s => !s.isOnline).length, [staffStatusList]);

  // Filtered staff list based on status filter and search query
  const filteredStaff = useMemo(() => {
    return staffStatusList.filter(s => {
      if (statusFilter === 'online' && !s.isOnline) return false;
      if (statusFilter === 'offline' && s.isOnline) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesUsername = s.username.toLowerCase().includes(q);
        const matchesRole = s.role.toLowerCase().includes(q);
        if (!matchesName && !matchesUsername && !matchesRole) return false;
      }
      return true;
    });
  }, [staffStatusList, statusFilter, searchQuery]);

  const getRoleBadge = (role: UserRole, counter?: string) => {
    switch (role) {
      case 'admin':
        return (
          <span className="px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-extrabold uppercase flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-orange-600" /> Store Admin
          </span>
        );
      case 'cash_counter':
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold uppercase flex items-center gap-1">
            <Calculator className="w-3 h-3 text-emerald-600" /> Cash Counter {counter ? `#${counter}` : ''}
          </span>
        );
      case 'product_register':
        return (
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-extrabold uppercase flex items-center gap-1">
            <PackageCheck className="w-3 h-3 text-blue-600" /> Product Register
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-extrabold uppercase">
            {role ? String(role).replace(/_/g, ' ') : 'Staff'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 static">
      {/* Top Banner - Stationary without motion or sticky movement */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs static">
        <div className="flex items-center gap-3 static">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200 shadow-2xs">
            <Activity className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-slate-900">Staff & Operations Status</h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live Status
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Real-time monitor showing which staff members are currently online or offline
            </p>
          </div>
        </div>

        {/* Live Counters Summary */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-black text-emerald-800">{onlineCount} Online Now</span>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-xs font-black text-slate-700">{offlineCount} Offline</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Staff ({staffStatusList.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('online')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
              statusFilter === 'online'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${statusFilter === 'online' ? 'bg-white' : 'bg-emerald-500'}`} />
            Online ({onlineCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('offline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
              statusFilter === 'offline'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${statusFilter === 'offline' ? 'bg-white' : 'bg-slate-400'}`} />
            Offline ({offlineCount})
          </button>
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search staff name or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500 font-medium"
          />
        </div>
      </div>

      {/* Staff Online / Offline Status Roster */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Current Staff Roster ({filteredStaff.length})
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Status at current time
          </span>
        </div>

        {filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <UserX className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
            <p className="font-bold text-slate-600">No staff accounts match the filter</p>
            <p className="text-xs text-slate-400">
              {statusFilter === 'online'
                ? 'No staff members are currently online.'
                : statusFilter === 'offline'
                ? 'All staff members are currently online.'
                : 'No staff accounts found for this store.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {filteredStaff.map((staff) => (
              <div 
                key={staff.id} 
                className={`p-4 rounded-2xl border transition-all shadow-2xs space-y-3 ${
                  staff.isOnline 
                    ? 'border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50/60' 
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50/90 opacity-90'
                }`}
              >
                {/* Header: Name and Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${staff.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="font-black text-slate-900 text-sm leading-tight">{staff.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">@{staff.username}</div>
                  </div>

                  {staff.isOnline ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wide shadow-2xs flex items-center gap-1">
                      <CircleDot className="w-3 h-3 text-emerald-200" /> Online
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-600 font-extrabold text-[10px] uppercase tracking-wide">
                      Offline
                    </span>
                  )}
                </div>

                {/* Role Badge */}
                <div>
                  {getRoleBadge(staff.role, staff.counterNumber)}
                </div>

                {/* Details Section */}
                <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-200/80 pt-2.5">
                  {staff.isOnline ? (
                    <>
                      <div className="flex justify-between items-center text-slate-700">
                        <span className="text-slate-500 font-medium">Logged In:</span>
                        <span className="font-mono font-bold text-slate-900 flex items-center gap-1">
                          <LogIn className="w-3 h-3 text-emerald-600" />
                          {staff.loginTime ? new Date(staff.loginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-emerald-900 font-bold bg-emerald-100/70 px-2.5 py-1 rounded-xl">
                        <span>Current Active Time:</span>
                        <span className="font-mono text-xs text-emerald-800">
                          {staff.duration || '0 mins'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Status:</span>
                      <span className="font-medium text-slate-600">
                        {staff.lastSeen 
                          ? `Last active: ${new Date(staff.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
                          : 'Currently not signed in'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
