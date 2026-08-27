// Bundled demo dataset. Mirrors the shape of a Grist table so the same renderer works
// whether data comes from Grist or from here. Deterministically generated => stable charts.
// Shipped to GitHub Pages so the widget looks alive before anyone connects real data.

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = ['North', 'South', 'East', 'West'];
const CATEGORIES = ['Electronics', 'Apparel', 'Home', 'Sports'];
const CHANNELS = ['Online', 'Retail', 'Partner'];
const PRODUCTS = ['Nimbus', 'Vertex', 'Aura', 'Pulse', 'Drift', 'Ember'];
const MONTHS = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
                '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'];

function buildSales() {
  const rnd = mulberry32(20260624);
  const rows = [];
  let id = 1;
  for (const month of MONTHS) {
    for (const cat of CATEGORIES) {
      const region = REGIONS[Math.floor(rnd() * REGIONS.length)];
      const channel = CHANNELS[Math.floor(rnd() * CHANNELS.length)];
      const product = PRODUCTS[Math.floor(rnd() * PRODUCTS.length)];
      // Seasonality alone (a pure sine over the year) peaks in spring and troughs in autumn, so
      // the back half of the year always sits below the front half. The KPI cards on the demo's
      // landing page compare exactly those two halves — which meant the first thing anyone saw was
      // Revenue, Units and Profit all down 40-45% in red. A demo should show a business worth
      // copying, so there is now a growth trend underneath the seasonal wobble: the year still
      // undulates (that is what makes the line chart interesting) but it climbs.
      // The -8 phase shift puts the seasonal peak in November/December and the trough in early
      // summer, which is how retail categories like these actually behave — and it stops the
      // spring peak from cancelling out the growth trend in the half-vs-half KPI comparison.
      const i = MONTHS.indexOf(month);
      const growth = 1 + 0.7 * (i / (MONTHS.length - 1));
      const seasonal = 1 + 0.18 * Math.sin(((i - 8) / 12) * Math.PI * 2);
      const base = { Electronics: 1900, Apparel: 1200, Home: 950, Sports: 760 }[cat];
      const units = Math.round((base * growth * seasonal * (0.8 + rnd() * 0.4)) / 10);
      const price = { Electronics: 240, Apparel: 65, Home: 120, Sports: 95 }[cat] * (0.9 + rnd() * 0.3);
      const revenue = Math.round(units * price);
      const cost = Math.round(revenue * (0.52 + rnd() * 0.16));
      const profit = revenue - cost;
      rows.push({
        id: id++,
        Month: month + '-01',
        Region: region,
        Category: cat,
        Channel: channel,
        Product: product,
        Units: units,
        Revenue: revenue,
        Cost: cost,
        Profit: profit,
        Margin: Math.round((profit / revenue) * 1000) / 10,
        Satisfaction: Math.round((3.4 + rnd() * 1.6) * 10) / 10,
      });
    }
  }
  return rows;
}

const SALES_COLUMNS = [
  { id: 'Month', label: 'Month', type: 'Date' },
  { id: 'Region', label: 'Region', type: 'Choice' },
  { id: 'Category', label: 'Category', type: 'Choice' },
  { id: 'Channel', label: 'Channel', type: 'Choice' },
  { id: 'Product', label: 'Product', type: 'Text' },
  { id: 'Units', label: 'Units', type: 'Int' },
  { id: 'Revenue', label: 'Revenue', type: 'Numeric' },
  { id: 'Cost', label: 'Cost', type: 'Numeric' },
  { id: 'Profit', label: 'Profit', type: 'Numeric' },
  { id: 'Margin', label: 'Margin %', type: 'Numeric' },
  { id: 'Satisfaction', label: 'Satisfaction', type: 'Numeric' },
];

// A second, very different dataset (people/HR) so the demo shows the widget is general-purpose
// and handles text / choice / date / int / numeric / bool columns — not just revenue.
const DEPARTMENTS = ['Engineering', 'Design', 'Sales', 'Marketing', 'Support', 'Operations'];
const ROLES = ['Junior', 'Mid', 'Senior', 'Lead', 'Manager'];
const CITIES = ['London', 'Berlin', 'Toronto', 'Austin', 'Dhaka', 'Singapore'];
const CITY_COORDS = {
  London: [51.51, -0.13], Berlin: [52.52, 13.40], Toronto: [43.65, -79.38],
  Austin: [30.27, -97.74], Dhaka: [23.81, 90.41], Singapore: [1.35, 103.82],
};
const FIRST = ['Aria', 'Noah', 'Mia', 'Liam', 'Zoe', 'Ravi', 'Sara', 'Kenji', 'Ines', 'Omar', 'Lena', 'Theo', 'Nadia', 'Yusuf', 'Elsa', 'Diego', 'Priya', 'Hugo', 'Maya', 'Felix'];
const LAST = ['Khan', 'Smith', 'Müller', 'Tanaka', 'Costa', 'Patel', 'Nguyen', 'Rossi', 'Park', 'Haddad'];

function buildPeople() {
  const rnd = mulberry32(77123);
  const rows = [];
  for (let i = 0; i < 36; i++) {
    const dept = DEPARTMENTS[Math.floor(rnd() * DEPARTMENTS.length)];
    const role = ROLES[Math.floor(rnd() * ROLES.length)];
    const seniority = ROLES.indexOf(role);
    const age = 23 + Math.floor(rnd() * 28);
    const year = 2016 + Math.floor(rnd() * 10);
    const month = 1 + Math.floor(rnd() * 12);
    const city = CITIES[Math.floor(rnd() * CITIES.length)];
    const [clat, clon] = CITY_COORDS[city];
    rows.push({
      id: i + 1,
      Name: `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`,
      Department: dept,
      Role: role,
      City: city,
      JoinDate: `${year}-${String(month).padStart(2, '0')}-15`,
      Age: age,
      Salary: 45000 + seniority * 18000 + Math.floor(rnd() * 16000),
      Rating: Math.round((3 + rnd() * 2) * 10) / 10,
      Remote: rnd() > 0.5,
      Latitude: Math.round((clat + (rnd() - 0.5) * 0.5) * 10000) / 10000,
      Longitude: Math.round((clon + (rnd() - 0.5) * 0.5) * 10000) / 10000,
    });
  }
  return rows;
}

const PEOPLE_COLUMNS = [
  { id: 'Name', label: 'Name', type: 'Text' },
  { id: 'Department', label: 'Department', type: 'Choice' },
  { id: 'Role', label: 'Role', type: 'Choice' },
  { id: 'City', label: 'City', type: 'Choice' },
  { id: 'JoinDate', label: 'Join Date', type: 'Date' },
  { id: 'Age', label: 'Age', type: 'Int' },
  { id: 'Salary', label: 'Salary', type: 'Numeric' },
  { id: 'Rating', label: 'Performance', type: 'Numeric' },
  { id: 'Remote', label: 'Remote', type: 'Bool' },
  { id: 'Latitude', label: 'Latitude', type: 'Numeric' },
  { id: 'Longitude', label: 'Longitude', type: 'Numeric' },
];

// A third dataset (project tasks) so the demo can show the Calendar block — due dates are
// spread relative to *today* (not a fixed date, unlike Sales/People's historical data) so the
// calendar always has visible events on its default, current-month view.
const TASK_TEMPLATES = [
  { task: 'Prepare quarterly board deck', project: 'Q3 Reporting', priority: 'High' },
  { task: 'Migrate reporting pipeline to new schema', project: 'Platform Migration', priority: 'High' },
  { task: 'Review Q3 marketing spend', project: 'Marketing Analytics', priority: 'Medium' },
  { task: 'Client onboarding call', project: 'Client Onboarding', priority: 'Medium' },
  { task: 'Publish monthly sales forecast', project: 'Q3 Reporting', priority: 'Medium' },
  { task: 'Fix broken dashboard link', project: 'Platform Migration', priority: 'High' },
  { task: 'Renew annual software licenses', project: 'Operations', priority: 'Low' },
  { task: 'Run team performance reviews', project: 'Operations', priority: 'Medium' },
  { task: 'Plan Q4 roadmap', project: 'Q3 Reporting', priority: 'High' },
  { task: 'Audit data pipeline for errors', project: 'Data Pipeline', priority: 'High' },
  { task: 'Update brand guidelines', project: 'Marketing Analytics', priority: 'Low' },
  { task: 'Prepare investor update', project: 'Q3 Reporting', priority: 'High' },
  { task: 'Set up new client workspace', project: 'Client Onboarding', priority: 'Medium' },
  { task: 'Optimize slow chart queries', project: 'Data Pipeline', priority: 'Medium' },
];
const TASKS_COLUMNS = [
  { id: 'Task', label: 'Task', type: 'Text' }, { id: 'Project', label: 'Project', type: 'Text' },
  { id: 'Priority', label: 'Priority', type: 'Choice' }, { id: 'AssignedTo', label: 'Assigned To', type: 'Text' },
  { id: 'DueDate', label: 'Due Date', type: 'Date' }, { id: 'Status', label: 'Status', type: 'Choice' },
  { id: 'Notes', label: 'Notes', type: 'Text' },
];
function buildTasks(peopleRows) {
  const rnd = mulberry32(90210);
  const assignees = peopleRows.slice(0, 8).map((p) => p.Name);
  const rows = [];
  for (let i = 0; i < 18; i++) {
    const t = TASK_TEMPLATES[i % TASK_TEMPLATES.length];
    const dayOffset = Math.round(-10 + rnd() * 40);
    const due = new Date(); due.setDate(due.getDate() + dayOffset); due.setHours(0, 0, 0, 0);
    const status = dayOffset < -2 ? (rnd() < 0.7 ? 'Done' : 'In Progress') : ['Not Started', 'Pending', 'In Progress'][Math.floor(rnd() * 3)];
    rows.push({
      id: i + 1, Task: t.task, Project: t.project, Priority: t.priority,
      AssignedTo: assignees[Math.floor(rnd() * assignees.length)],
      DueDate: due.toISOString().slice(0, 10), Status: status,
      Notes: status === 'Done' ? 'Completed on schedule.' : status === 'In Progress' ? `Progress: ${Math.floor(30 + rnd() * 60)}% complete` : '',
    });
  }
  return rows;
}

const peopleRows = buildPeople();


// ---- Invoices ----------------------------------------------------------------
// Three linked tables, because that is what an invoice actually is: a header, the lines on it, and
// somebody to send it to. Deliberately small — this exists to show the Invoice block working, not
// to be a finance dataset; Sales above is where the volume lives.
const INVOICES_COLUMNS = [
  { id: 'InvoiceNumber', label: 'Invoice no.', type: 'Text' },
  { id: 'Client', label: 'Client', type: 'Text' },
  { id: 'IssueDate', label: 'Issued', type: 'Date' },
  { id: 'DueDate', label: 'Due', type: 'Date' },
  { id: 'Amount', label: 'Amount', type: 'Numeric' },
  { id: 'Status', label: 'Status', type: 'Choice' },
  { id: 'Note', label: 'Note', type: 'Text' },
];
const INVOICE_ITEMS_COLUMNS = [
  { id: 'Invoice', label: 'Invoice no.', type: 'Text' },
  { id: 'Description', label: 'Description', type: 'Text' },
  { id: 'Quantity', label: 'Qty', type: 'Numeric' },
  { id: 'UnitPrice', label: 'Unit price', type: 'Numeric' },
  { id: 'LineTotal', label: 'Line total', type: 'Numeric' },
];
const CLIENTS_COLUMNS = [
  { id: 'Name', label: 'Client', type: 'Text' },
  { id: 'Street', label: 'Street', type: 'Text' },
  { id: 'City', label: 'City', type: 'Text' },
  { id: 'Country', label: 'Country', type: 'Text' },
];

const DEMO_CLIENTS = [
  ['Harbour Freight Ltd', '18 Dock Road', 'Bristol BS1 6TH', 'United Kingdom'],
  ['Bluewave Media', '442 Sunset Avenue', 'Austin, TX 78701', 'United States'],
  ['Northvale Scientific', 'Industriestrasse 9', '8005 Zurich', 'Switzerland'],
  ['Meridian Analytics', '7 Rue des Halles', '75001 Paris', 'France'],
  ['Cedar & Finch', '221 Baker Street', 'London NW1 6XE', 'United Kingdom'],
];

// Each invoice gets two or three real-sounding lines, and its Amount is their sum — so the ledger
// above and the document below can never disagree, which is exactly the property the block relies
// on when it falls back to a single line.
const DEMO_WORK = [
  ['Dashboard design and build', 1, 4800],
  ['Data migration and cleanup', 12, 145],
  ['Team training session', 2, 650],
  ['Monthly support retainer', 3, 900],
  ['Custom report development', 6, 320],
  ['Integration setup', 1, 2200],
];

function buildInvoices() {
  const rnd = mulberry32(7731);
  const invoices = []; const items = [];
  const statuses = ['Paid', 'Paid', 'Sent', 'Sent', 'Overdue', 'Draft'];
  for (let i = 0; i < 12; i++) {
    const number = 'INV-' + (2040 + i);
    const issued = new Date(); issued.setDate(issued.getDate() - Math.round(8 + rnd() * 90));
    issued.setHours(0, 0, 0, 0);
    const due = new Date(issued); due.setDate(due.getDate() + 30);
    const lineCount = 2 + Math.floor(rnd() * 2);
    let total = 0;
    for (let j = 0; j < lineCount; j++) {
      const [desc, qty, price] = DEMO_WORK[(i + j * 2) % DEMO_WORK.length];
      const lineTotal = qty * price;
      total += lineTotal;
      items.push({ id: items.length + 1, Invoice: number, Description: desc, Quantity: qty, UnitPrice: price, LineTotal: lineTotal });
    }
    invoices.push({
      id: i + 1, InvoiceNumber: number,
      Client: DEMO_CLIENTS[i % DEMO_CLIENTS.length][0],
      IssueDate: issued.toISOString().slice(0, 10),
      DueDate: due.toISOString().slice(0, 10),
      Amount: total,
      Status: statuses[i % statuses.length],
      Note: i % 4 === 0 ? 'Thank you for your business.' : '',
    });
  }
  return { invoices, items };
}
const demoInvoicing = buildInvoices();

export const DUMMY_DATA = {
  defaultTable: 'Sales',
  tables: {
    Sales: { id: 'Sales', label: 'Sales (demo)', columns: SALES_COLUMNS, records: buildSales() },
    People: { id: 'People', label: 'People (demo)', columns: PEOPLE_COLUMNS, records: peopleRows },
    Tasks: { id: 'Tasks', label: 'Tasks (demo)', columns: TASKS_COLUMNS, records: buildTasks(peopleRows) },
    Invoices: { id: 'Invoices', label: 'Invoices (demo)', columns: INVOICES_COLUMNS, records: demoInvoicing.invoices },
    InvoiceItems: { id: 'InvoiceItems', label: 'Invoice items (demo)', columns: INVOICE_ITEMS_COLUMNS, records: demoInvoicing.items },
    Clients: { id: 'Clients', label: 'Clients (demo)', columns: CLIENTS_COLUMNS, records: DEMO_CLIENTS.map((c, i) => ({ id: i + 1, Name: c[0], Street: c[1], City: c[2], Country: c[3] })) },
  },
};
