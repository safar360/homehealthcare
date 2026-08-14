import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://your-project-ref.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type Manager = {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  city_slug: string;
  managed_locations: string[];
  is_active: boolean;
};

type Staff = {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  staff_role: string;
  city_slug: string;
  assigned_manager_id: string;
  assigned_location: string;
  qualifications: string[];
  availability_status: string;
  is_active: boolean;
  created_at: string;
};

type FormData = {
  full_name: string;
  email: string;
  phone_number: string;
  assigned_location: string;
  staff_role: string;
  qualifications: string;
  availability_status: string;
};

const staffRoles = ['nurse', 'assistant', 'therapist', 'care_coordinator', 'supervisor'];
const availabilityStatus = ['available', 'on_leave', 'inactive', 'training'];

export default function ManagerPortal() {
  const [manager, setManager] = useState<Manager | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'staff' | 'requests'>('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<FormData>({
    full_name: '',
    email: '',
    phone_number: '',
    assigned_location: '',
    staff_role: 'assistant',
    qualifications: '',
    availability_status: 'available',
  });

  // Load manager and their staff
  useEffect(() => {
    loadManagerData();
  }, []);

  const loadManagerData = async () => {
    setLoading(true);
    try {
      // In real app, would get current user's manager record
      // For now, loads first active manager (for testing)
      const { data: managerData } = await supabase
        .from('location_managers')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (managerData) {
        setManager(managerData as Manager);

        // Load this manager's staff
        const { data: staffData } = await supabase
          .from('location_staff')
          .select('*')
          .eq('assigned_manager_id', managerData.id)
          .eq('is_active', true)
          .order('full_name');

        setStaff((staffData as Staff[]) || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  const handleAddStaff = () => {
    setEditingId(null);
    setFormData({
      full_name: '',
      email: '',
      phone_number: '',
      assigned_location: '',
      staff_role: 'assistant',
      qualifications: '',
      availability_status: 'available',
    });
    setShowAddModal(true);
  };

  const handleEditStaff = (staffMember: Staff) => {
    setEditingId(staffMember.id);
    setFormData({
      full_name: staffMember.full_name,
      email: staffMember.email || '',
      phone_number: staffMember.phone_number || '',
      assigned_location: staffMember.assigned_location || '',
      staff_role: staffMember.staff_role,
      qualifications: staffMember.qualifications.join(', '),
      availability_status: staffMember.availability_status,
    });
    setShowAddModal(true);
  };

  const handleSaveStaff = async () => {
    if (!formData.full_name || !formData.email) {
      alert('Please fill in required fields');
      return;
    }

    try {
      if (editingId) {
        await supabase.from('location_staff').update({
          full_name: formData.full_name,
          email: formData.email,
          phone_number: formData.phone_number,
          assigned_location: formData.assigned_location,
          staff_role: formData.staff_role,
          qualifications: formData.qualifications ? formData.qualifications.split(',').map(s => s.trim()) : [],
          availability_status: formData.availability_status,
          updated_at: new Date().toISOString(),
        }).eq('id', editingId);
      } else {
        if (!manager) return;
        await supabase.from('location_staff').insert([{
          full_name: formData.full_name,
          email: formData.email,
          phone_number: formData.phone_number,
          assigned_location: formData.assigned_location,
          staff_role: formData.staff_role,
          qualifications: formData.qualifications ? formData.qualifications.split(',').map(s => s.trim()) : [],
          availability_status: formData.availability_status,
          city_slug: manager.city_slug,
          assigned_manager_id: manager.id,
        }]);
      }

      setShowAddModal(false);
      await loadManagerData();
    } catch (error) {
      console.error('Error saving staff:', error);
      alert('Error saving staff');
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this staff member?')) return;

    try {
      await supabase.from('location_staff').update({ is_active: false }).eq('id', id);
      await loadManagerData();
    } catch (error) {
      console.error('Error deleting staff:', error);
      alert('Error deleting staff');
    }
  };

  const filteredStaff = staff.filter(s => {
    const matchesStatus = !filterStatus || s.availability_status === filterStatus;
    const matchesSearch = !searchTerm || 
      s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  const statsOverview = {
    totalStaff: staff.length,
    availableStaff: staff.filter(s => s.availability_status === 'available').length,
    onLeave: staff.filter(s => s.availability_status === 'on_leave').length,
    byRole: staffRoles.reduce((acc, role) => ({
      ...acc,
      [role]: staff.filter(s => s.staff_role === role).length
    }), {} as Record<string, number>)
  };

  if (loading) {
    return <div className="app-shell"><p>Loading...</p></div>;
  }

  if (!manager) {
    return (
      <div className="app-shell">
        <header className="hero-card">
          <h1>Manager Portal</h1>
          <p>Unable to load manager data. Please contact administrator.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div>
          <h1>👤 {manager.full_name}</h1>
          <p>Manager Portal for {manager.city_slug}</p>
        </div>
        <div className="manager-info">
          <p><strong>Email:</strong> {manager.email}</p>
          <p><strong>Phone:</strong> {manager.phone_number || '-'}</p>
          <p><strong>Locations:</strong> {manager.managed_locations.join(', ') || 'All'}</p>
        </div>
      </header>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          My Staff ({staff.length})
        </button>
        <button 
          className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          Requests
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="dashboard-grid">
          <div className="stat-card">
            <h3>Total Staff</h3>
            <p className="stat-number">{statsOverview.totalStaff}</p>
          </div>
          <div className="stat-card">
            <h3>Available</h3>
            <p className="stat-number" style={{color: '#10b981'}}>{statsOverview.availableStaff}</p>
          </div>
          <div className="stat-card">
            <h3>On Leave</h3>
            <p className="stat-number" style={{color: '#f59e0b'}}>{statsOverview.onLeave}</p>
          </div>
          <div className="stat-card">
            <h3>Staff by Role</h3>
            <div className="role-breakdown">
              {Object.entries(statsOverview.byRole).map(([role, count]) => (
                count > 0 && (
                  <div key={role} className="role-item">
                    <span>{role}</span>
                    <strong>{count}</strong>
                  </div>
                )
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Staff Tab */}
      {activeTab === 'staff' && (
        <div className="content-section">
          <div className="section-header">
            <h2>My Team</h2>
            <button 
              className="btn-primary"
              onClick={handleAddStaff}
            >
              + Add Staff
            </button>
          </div>

          <div className="filters">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="filter-input"
            />
            <select 
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="">All Status</option>
              {availabilityStatus.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <button 
              className="btn-secondary"
              onClick={() => {
                setFilterStatus('');
                setSearchTerm('');
              }}
            >
              Clear Filters
            </button>
          </div>

          <div className="staff-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Qualifications</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map(staffMember => (
                  <tr key={staffMember.id}>
                    <td><strong>{staffMember.full_name}</strong></td>
                    <td>{staffMember.email || '-'}</td>
                    <td>{staffMember.phone_number || '-'}</td>
                    <td><span className="badge badge-role">{staffMember.staff_role}</span></td>
                    <td>{staffMember.assigned_location || '-'}</td>
                    <td>
                      <span className={`status ${staffMember.availability_status === 'available' ? 'active' : 'inactive'}`}>
                        {staffMember.availability_status}
                      </span>
                    </td>
                    <td>
                      <div className="qualifications">
                        {staffMember.qualifications.map(q => (
                          <span key={q} className="qual-tag">{q}</span>
                        ))}
                      </div>
                    </td>
                    <td className="actions">
                      <button 
                        className="btn-small"
                        onClick={() => handleEditStaff(staffMember)}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn-danger-small"
                        onClick={() => handleDeleteStaff(staffMember.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStaff.length === 0 && (
              <div className="no-data">
                {staff.length === 0 
                  ? 'No staff added yet. Click "Add Staff" to begin.'
                  : 'No staff found matching your filters'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="content-section">
          <h2>Requests</h2>
          <p className="placeholder">Staff transfer requests and other requests will appear here.</p>
          <p className="placeholder" style={{fontSize: '12px', color: '#999'}}>Coming soon: Request staff transfer to admin, report staffing issues</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingId ? 'Edit' : 'Add'} Staff Member</h2>
            
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={e => setFormData({...formData, full_name: e.target.value})}
                placeholder="Enter staff name"
              />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                placeholder="Enter email address"
              />
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                value={formData.phone_number}
                onChange={e => setFormData({...formData, phone_number: e.target.value})}
                placeholder="Enter phone number"
              />
            </div>

            <div className="form-group">
              <label>Role</label>
              <select
                value={formData.staff_role}
                onChange={e => setFormData({...formData, staff_role: e.target.value})}
              >
                {staffRoles.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Assigned Location</label>
              <input
                type="text"
                value={formData.assigned_location}
                onChange={e => setFormData({...formData, assigned_location: e.target.value})}
                placeholder="e.g., North Center"
              />
            </div>

            <div className="form-group">
              <label>Qualifications (comma-separated)</label>
              <input
                type="text"
                value={formData.qualifications}
                onChange={e => setFormData({...formData, qualifications: e.target.value})}
                placeholder="e.g., BSN, RN License, First Aid"
              />
            </div>

            <div className="form-group">
              <label>Availability Status</label>
              <select
                value={formData.availability_status}
                onChange={e => setFormData({...formData, availability_status: e.target.value})}
              >
                {availabilityStatus.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={handleSaveStaff}>
                Save
              </button>
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
