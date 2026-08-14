import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://your-project-ref.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type Dashboard = {
  total_managers: number;
  total_staff: number;
  total_cities: number;
  staff_by_role: Record<string, number>;
  staff_by_city: Record<string, number>;
  managers_by_city: Record<string, number>;
};

type Manager = {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  city_slug: string;
  managed_locations: string[];
  staff_count: number;
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
  city_slug: string;
  staff_role?: string;
  assigned_location?: string;
  qualifications?: string;
  availability_status?: string;
  managed_locations?: string;
};

const staffRoles = ['nurse', 'assistant', 'therapist', 'care_coordinator', 'supervisor'];
const availabilityStatus = ['available', 'on_leave', 'inactive', 'training'];

export default function AdminPortal() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'managers' | 'staff' | 'transfers'>('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<'manager' | 'staff'>('manager');
  
  const [filterCity, setFilterCity] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<FormData>({
    full_name: '',
    email: '',
    phone_number: '',
    city_slug: '',
    staff_role: 'assistant',
    assigned_location: '',
    qualifications: '',
    availability_status: 'available',
    managed_locations: '',
  });

  const [cities, setCities] = useState<{ slug: string; name: string }[]>([]);

  // Load initial data
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      // Load cities
      const { data: citiesData } = await supabase.from('cities').select('slug, name').eq('is_active', true);
      setCities(citiesData || []);

      // Load dashboard
      const { data: dashData } = await supabase.rpc('get_admin_dashboard_summary');
      setDashboard(dashData);

      // Load managers with staff count
      const { data: managersData } = await supabase.rpc('get_managers_with_staff_count');
      setManagers((managersData as Manager[]) || []);

      // Load all staff
      const { data: staffData } = await supabase.from('location_staff').select('*').eq('is_active', true);
      setStaff((staffData as Staff[]) || []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  const handleAddEntity = () => {
    setEditingId(null);
    setFormData({
      full_name: '',
      email: '',
      phone_number: '',
      city_slug: '',
      staff_role: 'assistant',
      assigned_location: '',
      qualifications: '',
      availability_status: 'available',
      managed_locations: '',
    });
    setShowAddModal(true);
  };

  const handleEditEntity = (entity: Manager | Staff) => {
    setEditingId(entity.id);
    if ('staff_role' in entity) {
      // It's a staff member
      const staffMember = entity as Staff;
      setEntityType('staff');
      setFormData({
        full_name: staffMember.full_name,
        email: staffMember.email || '',
        phone_number: staffMember.phone_number || '',
        city_slug: staffMember.city_slug,
        staff_role: staffMember.staff_role,
        assigned_location: staffMember.assigned_location || '',
        qualifications: staffMember.qualifications.join(', '),
        availability_status: staffMember.availability_status,
      });
    } else {
      // It's a manager
      const manager = entity as Manager;
      setEntityType('manager');
      setFormData({
        full_name: manager.full_name,
        email: manager.email,
        phone_number: manager.phone_number || '',
        city_slug: manager.city_slug,
        managed_locations: manager.managed_locations.join(', '),
      });
    }
    setShowAddModal(true);
  };

  const handleSaveEntity = async () => {
    if (!formData.full_name || !formData.email || !formData.city_slug) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      if (entityType === 'manager') {
        if (editingId) {
          await supabase.from('location_managers').update({
            full_name: formData.full_name,
            email: formData.email,
            phone_number: formData.phone_number,
            city_slug: formData.city_slug,
            managed_locations: formData.managed_locations ? formData.managed_locations.split(',').map(s => s.trim()) : [],
            updated_at: new Date().toISOString(),
          }).eq('id', editingId);
        } else {
          await supabase.from('location_managers').insert([{
            full_name: formData.full_name,
            email: formData.email,
            phone_number: formData.phone_number,
            city_slug: formData.city_slug,
            managed_locations: formData.managed_locations ? formData.managed_locations.split(',').map(s => s.trim()) : [],
          }]);
        }
      } else {
        if (editingId) {
          await supabase.from('location_staff').update({
            full_name: formData.full_name,
            email: formData.email,
            phone_number: formData.phone_number,
            city_slug: formData.city_slug,
            staff_role: formData.staff_role,
            assigned_location: formData.assigned_location,
            qualifications: formData.qualifications ? formData.qualifications.split(',').map(s => s.trim()) : [],
            availability_status: formData.availability_status,
            updated_at: new Date().toISOString(),
          }).eq('id', editingId);
        } else {
          await supabase.from('location_staff').insert([{
            full_name: formData.full_name,
            email: formData.email,
            phone_number: formData.phone_number,
            city_slug: formData.city_slug,
            staff_role: formData.staff_role,
            assigned_location: formData.assigned_location,
            qualifications: formData.qualifications ? formData.qualifications.split(',').map(s => s.trim()) : [],
            availability_status: formData.availability_status,
          }]);
        }
      }

      setShowAddModal(false);
      await loadAllData();
    } catch (error) {
      console.error('Error saving entity:', error);
      alert('Error saving entity');
    }
  };

  const handleDeleteEntity = async (id: string, type: 'manager' | 'staff') => {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) return;

    try {
      const table = type === 'manager' ? 'location_managers' : 'location_staff';
      await supabase.from(table).update({ is_active: false }).eq('id', id);
      await loadAllData();
    } catch (error) {
      console.error('Error deleting entity:', error);
      alert('Error deleting entity');
    }
  };

  const filteredStaff = staff.filter(s => {
    const matchesCity = !filterCity || s.city_slug === filterCity;
    const matchesRole = !filterRole || s.staff_role === filterRole;
    const matchesStatus = !filterStatus || s.availability_status === filterStatus;
    const matchesSearch = !searchTerm || 
      s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesCity && matchesRole && matchesStatus && matchesSearch;
  });

  if (loading) {
    return <div className="app-shell"><p>Loading...</p></div>;
  }

  return (
    <div className="app-shell">
      <header className="hero-card">
        <h1>🏥 Admin Portal - Staff Management</h1>
        <p>Manage admins, managers, and staff across all locations</p>
      </header>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button 
          className={`tab ${activeTab === 'managers' ? 'active' : ''}`}
          onClick={() => setActiveTab('managers')}
        >
          Managers ({managers.length})
        </button>
        <button 
          className={`tab ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          Staff ({staff.length})
        </button>
        <button 
          className={`tab ${activeTab === 'transfers' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfers')}
        >
          Transfers
        </button>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && dashboard && (
        <div className="dashboard-grid">
          <div className="stat-card">
            <h3>Total Managers</h3>
            <p className="stat-number">{dashboard.total_managers}</p>
          </div>
          <div className="stat-card">
            <h3>Total Staff</h3>
            <p className="stat-number">{dashboard.total_staff}</p>
          </div>
          <div className="stat-card">
            <h3>Active Cities</h3>
            <p className="stat-number">{dashboard.total_cities}</p>
          </div>
          <div className="stat-card">
            <h3>Staff by Role</h3>
            <div className="role-breakdown">
              {Object.entries(dashboard.staff_by_role || {}).map(([role, count]) => (
                <div key={role} className="role-item">
                  <span>{role}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="stat-card">
            <h3>Staff by City</h3>
            <div className="city-breakdown">
              {Object.entries(dashboard.staff_by_city || {}).map(([city, count]) => (
                <div key={city} className="city-item">
                  <span>{city}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="stat-card">
            <h3>Managers by City</h3>
            <div className="city-breakdown">
              {Object.entries(dashboard.managers_by_city || {}).map(([city, count]) => (
                <div key={city} className="city-item">
                  <span>{city}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Managers Tab */}
      {activeTab === 'managers' && (
        <div className="content-section">
          <div className="section-header">
            <h2>Location Managers</h2>
            <button 
              className="btn-primary"
              onClick={() => {
                setEntityType('manager');
                handleAddEntity();
              }}
            >
              + Add Manager
            </button>
          </div>

          <div className="managers-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Locations</th>
                  <th>Staff Count</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {managers.map(manager => (
                  <tr key={manager.id}>
                    <td>{manager.full_name}</td>
                    <td>{manager.email}</td>
                    <td>{manager.phone_number || '-'}</td>
                    <td>{manager.city_slug}</td>
                    <td>{manager.managed_locations.join(', ') || '-'}</td>
                    <td>{manager.staff_count}</td>
                    <td>
                      <span className={`status ${manager.is_active ? 'active' : 'inactive'}`}>
                        {manager.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="actions">
                      <button 
                        className="btn-small"
                        onClick={() => handleEditEntity(manager)}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn-danger-small"
                        onClick={() => handleDeleteEntity(manager.id, 'manager')}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Staff Tab */}
      {activeTab === 'staff' && (
        <div className="content-section">
          <div className="section-header">
            <h2>Location Staff</h2>
            <button 
              className="btn-primary"
              onClick={() => {
                setEntityType('staff');
                handleAddEntity();
              }}
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
              value={filterCity}
              onChange={e => setFilterCity(e.target.value)}
              className="filter-select"
            >
              <option value="">All Cities</option>
              {cities.map(city => (
                <option key={city.slug} value={city.slug}>{city.name}</option>
              ))}
            </select>
            <select 
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
              className="filter-select"
            >
              <option value="">All Roles</option>
              {staffRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
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
                setFilterCity('');
                setFilterRole('');
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
                  <th>City</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Qualifications</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map(staffMember => (
                  <tr key={staffMember.id}>
                    <td>{staffMember.full_name}</td>
                    <td>{staffMember.email || '-'}</td>
                    <td>{staffMember.phone_number || '-'}</td>
                    <td><span className="badge badge-role">{staffMember.staff_role}</span></td>
                    <td>{staffMember.city_slug}</td>
                    <td>{staffMember.assigned_location || '-'}</td>
                    <td>
                      <span className={`status ${staffMember.availability_status === 'available' ? 'active' : 'inactive'}`}>
                        {staffMember.availability_status}
                      </span>
                    </td>
                    <td>{staffMember.qualifications.join(', ') || '-'}</td>
                    <td className="actions">
                      <button 
                        className="btn-small"
                        onClick={() => handleEditEntity(staffMember)}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn-danger-small"
                        onClick={() => handleDeleteEntity(staffMember.id, 'staff')}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStaff.length === 0 && (
              <div className="no-data">No staff found matching your filters</div>
            )}
          </div>
        </div>
      )}

      {/* Transfers Tab */}
      {activeTab === 'transfers' && (
        <div className="content-section">
          <h2>Staff Transfers</h2>
          <p className="placeholder">Transfer staff between managers or cities. Coming soon with detailed transfer workflows.</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingId ? 'Edit' : 'Add'} {entityType === 'manager' ? 'Manager' : 'Staff'}</h2>
            
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={e => setFormData({...formData, full_name: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                value={formData.phone_number}
                onChange={e => setFormData({...formData, phone_number: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>City *</label>
              <select
                value={formData.city_slug}
                onChange={e => setFormData({...formData, city_slug: e.target.value})}
              >
                <option value="">Select City</option>
                {cities.map(city => (
                  <option key={city.slug} value={city.slug}>{city.name}</option>
                ))}
              </select>
            </div>

            {entityType === 'manager' ? (
              <div className="form-group">
                <label>Managed Locations (comma-separated)</label>
                <input
                  type="text"
                  value={formData.managed_locations}
                  onChange={e => setFormData({...formData, managed_locations: e.target.value})}
                  placeholder="e.g., North Center, South Center"
                />
              </div>
            ) : (
              <>
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
              </>
            )}

            <div className="modal-actions">
              <button className="btn-primary" onClick={handleSaveEntity}>
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
