const API_URL = 'http://localhost:8080/api/v1';
const AUTH_HEADER = 'Basic ' + Buffer.from('admin:admin').toString('base64');

async function apiCall(method, endpoint, body = null) {
  const options = {
    method,
    headers: {
      'Authorization': AUTH_HEADER,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(`${API_URL}${endpoint}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return res.json();
}

async function createRole(name, data) {
  try {
    const role = await apiCall('POST', '/Role', { name, data });
    console.log(`Created Role: ${name}`);
    return role;
  } catch (err) {
    console.error(`Failed to create role ${name}:`, err.message);
  }
}

async function seedRoles() {
  console.log('Seeding Roles...');

  const entities = ['Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Task', 'Meeting', 'Call', 'Email', 'Document'];

  // Role 1: Super Admin
  const superAdminData = {};
  entities.forEach(e => {
    superAdminData[e] = { create: 'yes', read: 'all', edit: 'all', delete: 'all', stream: 'all' };
  });
  await createRole('Super Admin', superAdminData);

  // Role 2: Admin
  const adminData = {};
  entities.forEach(e => {
    adminData[e] = { create: 'yes', read: 'all', edit: 'all', delete: 'all', stream: 'all' };
  });
  await createRole('Admin', adminData);

  // Role 3: Manager
  const managerData = {};
  entities.forEach(e => {
    managerData[e] = { create: 'yes', read: 'team', edit: 'team', delete: 'team', stream: 'team' };
  });
  await createRole('Manager', managerData);

  // Role 4: Sales Executive
  const salesData = {};
  entities.forEach(e => {
    salesData[e] = { create: 'yes', read: 'own', edit: 'own', delete: 'own', stream: 'own' };
  });
  await createRole('Sales Executive', salesData);

  // Role 5: Support/User
  const supportData = {};
  entities.forEach(e => {
    if (['Contact', 'Case', 'Task', 'Call', 'Email'].includes(e)) {
      supportData[e] = { create: 'yes', read: 'team', edit: 'own', delete: 'no', stream: 'team' };
    } else {
      supportData[e] = { create: 'no', read: 'no', edit: 'no', delete: 'no', stream: 'no' };
    }
  });
  await createRole('Support/User', supportData);

  console.log('Roles seeded successfully.');
}

seedRoles().catch(console.error);
