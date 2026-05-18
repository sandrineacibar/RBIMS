// ══════════════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════════════
let DB = [];
let currentViewId = null;
let _detailOrigin = null; // 'records' | 'purok' | 'dashboard'
let _detailOriginPurok = null; // purok name if came from purok page

// ── DATE FORMATTER ──
function formatDate(val){
  if(!val) return '';
  // Parse YYYY-MM-DD manually to avoid UTC timezone shift (off-by-1 day bug)
  const iso = val.split('T')[0];
  const parts = iso.split('-');
  if(parts.length === 3){
    const d = new Date(+parts[0], +parts[1]-1, +parts[2]); // local time, no UTC offset
    if(!isNaN(d)) return d.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  }
  return val;
}

// ── DROPDOWN TOGGLE ──
function toggleHHDropdown(el){
  const dd = document.getElementById('hh-dropdown');
  const isOpen = dd.classList.toggle('open');
  el.classList.toggle('open', isOpen);
}
function setActiveSubItem(el){
  document.querySelectorAll('.nav-sub-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  // Also open parent dropdown
  const dd = document.getElementById('hh-dropdown');
  const toggle = document.querySelector('.nav-dropdown-toggle');
  dd.classList.add('open');
  if(toggle) toggle.classList.add('open');
}

function save(){try{localStorage.setItem('rbi_db2',JSON.stringify(DB));}catch(e){}}
function load(){try{const d=localStorage.getItem('rbi_db2');if(d)DB=JSON.parse(d);}catch(e){}}
load();

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
const pageMeta = {
  dashboard:  {title:'Dashboard', sub:'Barangay Pangabugan · Butuan City · Region XIII', actions:''},
  purok:      {title:'Purok Detail', sub:'Population breakdown by Purok', actions:''},
  records:    {title:'Household Records', sub:'Brgy. Pangabugan · Butuan City', actions:'records', year:true},
  report:     {title:'Summary Report – RBI Form C', sub:'Semestral Monitoring Report', actions:'report'},
};

function showPage(name, el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  if(el && el.classList) el.classList.add('active');
  // also match sidebar by data-page
  document.querySelectorAll('.nav-item[data-page="'+name+'"]').forEach(n=>n.classList.add('active'));

  const meta = pageMeta[name]||{title:'',sub:'',actions:''};
  document.getElementById('topbar-title').textContent = meta.title;
  document.getElementById('topbar-sub').textContent = meta.sub;
  renderTopbarActions(meta.actions);
  updateBadge();
}

function renderTopbarActions(key){
  const el = document.getElementById('topbar-actions');
  if(key==='records'){
    el.innerHTML=`<button class="btn btn-gold btn-sm" onclick="openAddModal()">+ New Household</button>`;
  } else if(key==='report'){
    el.innerHTML=`
      <button class="btn btn-excel btn-sm" onclick="exportSummaryExcel()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/></svg>
        Export Excel
      </button>
      <button class="btn btn-outline btn-sm" onclick="window.print()">🖨 Print</button>`;
  } else {
    el.innerHTML=`<button class="btn btn-gold btn-sm" onclick="openAddModal()">+ Add Household</button>`;
  }
}

function updateBadge(){
  const fp = activePurokFilter;
  const count = fp ? DB.filter(hh=>hh.address===fp).length : DB.length;
  document.getElementById('records-badge').textContent = fp ? count+'/'+DB.length : DB.length;
  populatePurokFilter();
}

// ══════════════════════════════════════════════════════════════
// ADD HOUSEHOLD MODAL
// ══════════════════════════════════════════════════════════════
function openAddModal(editMode=false){
  if(!editMode){
    clearForm();
    document.getElementById('f-hid').value=nextHID();
    document.getElementById('f-hno').placeholder='Select purok first';
    addMemberRow();
  }
  document.getElementById('add-modal-title').innerHTML = editMode
    ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:-2px;margin-right:6px"><path d="M11.7 2.3a1 1 0 011.4 1.4L4.4 12.4l-2.1.6.6-2.1 8.8-8.6z"/></svg> Edit Household – RBI Form A`
    : `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:-2px;margin-right:6px"><path d="M8 2a6 6 0 100 12A6 6 0 008 2zm1 5V5H7v2H5v2h2v2h2V9h2V7H9z"/></svg> Add Household – RBI Form A`;
  document.getElementById('add-hh-modal').classList.add('open');
}
function closeAddModal(){
  const wasEditing = editingHHId;
  editingHHId = null;
  document.getElementById('add-hh-modal').classList.remove('open');
  // If we were editing, go back to the household detail view (not the list)
  if(wasEditing){
    showPage('detail', null);
    viewHousehold(wasEditing);
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('add-hh-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeAddModal();});
  document.getElementById('delete-confirm-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeDeleteModal();});
  document.getElementById('bulk-delete-confirm-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeBulkDeleteModal();});
});


let memberRows = 0;
function nextHHNo(purok){
  if(!purok) return '';
  // Count existing HHs in this purok to get next number
  const count = DB.filter(hh=>hh.address===purok).length;
  return (count+1).toString().padStart(3,'0');
}
function nextHID(){
  return 'HH-'+(DB.length+1).toString().padStart(4,'0');
}
function onPurokChange(){
  const purok = document.getElementById('f-address').value;
  const hhnoEl = document.getElementById('f-hno');
  // Only auto-fill if not in edit mode and field is empty or was auto-filled
  if(purok){
    hhnoEl.value = nextHHNo(purok);
    hhnoEl.placeholder = 'Auto: '+nextHHNo(purok);
  } else {
    hhnoEl.value = '';
    hhnoEl.placeholder = 'Select purok first';
  }
}

function addMemberRow(data={}){
  memberRows++;
  const isHead = memberRows===1;
  const idx = memberRows;
  const card = document.createElement('div');
  card.className = 'member-card' + (isHead?' is-head':'');
  card.dataset.idx = idx;
  card.innerHTML=`
    <div class="member-card-header">
      <div class="member-num">${idx}</div>
      <div class="member-card-title">
        ${isHead ? 'Household Head <span class="head-badge">HEAD</span>' : 'Member ' + idx}
      </div>
      ${!isHead ? `<button class="member-del" onclick="delCard(this)">✕ Remove</button>` : ''}
    </div>

    <div class="member-section">
      <div class="member-section-title">Personal Information</div>
      <div class="member-grid cols5">
        <div class="form-group" style="grid-column:span 2">
          <label>Last Name</label>
          <input class="m-ln" placeholder="Last name" value="${esc(data.lastName||'')}">
        </div>
        <div class="form-group" style="grid-column:span 2">
          <label>First Name</label>
          <input class="m-fn" placeholder="First name" value="${esc(data.firstName||'')}">
        </div>
        <div class="form-group">
          <label>Ext. (Jr/Sr/III)</label>
          <input class="m-ext" placeholder="Jr/Sr/III" value="${esc(data.ext||'')}">
        </div>
      </div>
      <div class="member-grid cols4" style="margin-top:10px">
        <div class="form-group">
          <label>Middle Name</label>
          <input class="m-mn" placeholder="Middle name" value="${esc(data.middleName||'')}">
        </div>
        <div class="form-group">
          <label>Place of Birth</label>
          <input class="m-pob" placeholder="City/Municipality" value="${esc(data.placeOfBirth||'')}">
        </div>
        <div class="form-group">
          <label>Date of Birth</label>
          <input class="m-dob" type="date" value="${data.dateOfBirth||''}" onchange="calcAge(this)">
        </div>
        <div class="form-group">
          <label>Age</label>
          <input class="m-age" placeholder="0" value="${data.age||''}" readonly>
        </div>
      </div>
    </div>

    <div class="member-section">
      <div class="member-section-title">Demographics</div>
      <div class="member-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="form-group">
          <label>Sex</label>
          <select class="m-sex">
            <option value="">— Select —</option>
            <option ${data.sex==='Male'?'selected':''}>Male</option>
            <option ${data.sex==='Female'?'selected':''}>Female</option>
          </select>
        </div>
        <div class="form-group">
          <label>Civil Status</label>
          <select class="m-cs">
            <option value="Single" ${(data.civilStatus||'Single')==='Single'?'selected':''}>Single</option>
            <option value="Married" ${data.civilStatus==='Married'?'selected':''}>Married</option>
            <option value="Widowed" ${data.civilStatus==='Widowed'?'selected':''}>Widowed</option>
            <option value="Separated" ${data.civilStatus==='Separated'?'selected':''}>Separated</option>
          </select>
        </div>
        <div class="form-group">
          <label>Citizenship</label>
          <select class="m-cit">
            <option value="Filipino" ${data.citizenship!=='Foreigner'?'selected':''}>Filipino</option>
            <option value="Foreigner" ${data.citizenship==='Foreigner'?'selected':''}>Foreigner</option>
          </select>
        </div>
        <div class="form-group">
          <label>Religion</label>
          <input class="m-rel" placeholder="e.g. Catholic" value="${esc(data.religion||'')}">
        </div>
      </div>
    </div>

    <div class="member-section">
      <div class="member-section-title">Education &amp; School Status</div>
      <div class="member-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="form-group">
          <label>Educational Attainment</label>
          <select class="m-edu">
            <option value="">— Select —</option>
            <option ${data.education==='No Grade'?'selected':''}>No Grade</option>
            <option ${data.education==='Elementary'?'selected':''}>Elementary</option>
            <option ${data.education==='High School'?'selected':''}>High School</option>
            <option ${data.education==='College Level'?'selected':''}>College Level</option>
            <option ${data.education==='College Graduate'?'selected':''}>College Graduate</option>
            <option ${data.education==='Vocational'?'selected':''}>Vocational</option>
            <option ${data.education==='Post Graduate'?'selected':''}>Post Graduate</option>
          </select>
        </div>
        <div class="form-group">
          <label>School (Name)</label>
          <input class="m-school" placeholder="School name" value="${esc(data.school||'')}">
        </div>
        <div class="form-group">
          <label>School Status</label>
          <select class="m-schoolstatus">
            <option value="">— Select —</option>
            <option value="In School" ${data.schoolStatus==='In School'?'selected':''}>In School</option>
            <option value="Out of School" ${data.schoolStatus==='Out of School'?'selected':''}>Out of School</option>
          </select>
        </div>
        <div class="form-group">
          <label>Birth Certificate</label>
          <select class="m-birthcert">
            <option value="With Birth Cert." ${(data.birthCert||'With Birth Cert.')==='With Birth Cert.'?'selected':''}>With Birth Cert.</option>
            <option value="Without Birth Cert." ${data.birthCert==='Without Birth Cert.'?'selected':''}>Without Birth Cert.</option>
          </select>
        </div>
      </div>
    </div>

    <div class="member-section">
      <div class="member-section-title">Housing &amp; Lot Information</div>
      <div class="member-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="form-group">
          <label>House Ownership</label>
          <select class="m-house">
            <option value="">— Select —</option>
            <option value="Owner" ${data.houseOwnership==='Owner'?'selected':''}>Owner</option>
            <option value="Renter" ${data.houseOwnership==='Renter'?'selected':''}>Renter</option>
          </select>
        </div>
        <div class="form-group">
          <label>Type of House</label>
          <select class="m-housetype">
            <option value="">— Select —</option>
            <option value="Concrete" ${data.houseType==='Concrete'?'selected':''}>Concrete</option>
            <option value="Wooden" ${data.houseType==='Wooden'?'selected':''}>Wooden</option>
            <option value="Semi-Concrete" ${data.houseType==='Semi-Concrete'?'selected':''}>Semi-Concrete</option>
          </select>
        </div>
        <div class="form-group">
          <label>Potable Water Source</label>
          <select class="m-water">
            <option value="">— Select —</option>
            <option value="BCWD" ${data.waterSource==='BCWD'?'selected':''}>BCWD</option>
            <option value="Deepwell" ${data.waterSource==='Deepwell'?'selected':''}>Deepwell</option>
            <option value="Jetmatic" ${data.waterSource==='Jetmatic'?'selected':''}>Jetmatic</option>
            <option value="Refilling Station" ${data.waterSource==='Refilling Station'?'selected':''}>Refilling Station</option>
            <option value="Faucet/NAWASA" ${data.waterSource==='Faucet/NAWASA'?'selected':''}>Faucet/NAWASA</option>
          </select>
        </div>
        <div class="form-group">
          <label>Type of Toilet</label>
          <select class="m-toilet">
            <option value="">— Select —</option>
            <option value="Flush" ${data.toiletType==='Flush'?'selected':''}>Flush</option>
            <option value="Water Seal" ${data.toiletType==='Water Seal'?'selected':''}>Water Seal</option>
            <option value="Antipolo" ${data.toiletType==='Antipolo'?'selected':''}>Antipolo</option>
            <option value="None" ${data.toiletType==='None'?'selected':''}>None</option>
          </select>
        </div>
      </div>
      <div class="member-grid cols3" style="margin-top:10px">
        <div class="form-group">
          <label>Lot</label>
          <select class="m-lot">
            <option value="">— Select —</option>
            <option value="Owner" ${data.lotStatus==='Owner'?'selected':''}>Owner</option>
            <option value="Renter" ${data.lotStatus==='Renter'?'selected':''}>Renter</option>
            <option value="Brgy. Site" ${data.lotStatus==='Brgy. Site'?'selected':''}>Brgy. Site</option>
            <option value="CRBDP" ${data.lotStatus==='CRBDP'?'selected':''}>CRBDP</option>
          </select>
        </div>
      </div>
    </div>

    <div class="member-section">
      <div class="member-section-title">Employment &amp; Income</div>
      <div class="member-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="form-group">
          <label>Occupation</label>
          <input class="m-occ" placeholder="e.g. Farmer, Teacher" value="${esc(data.occupation||'')}">
        </div>
        <div class="form-group">
          <label>Private Employee (Specify)</label>
          <input class="m-privemp" placeholder="Company / position" value="${esc(data.privateEmployee||'')}">
        </div>
        <div class="form-group">
          <label>Public Employee (Specify)</label>
          <input class="m-pubexp" placeholder="Agency / position" value="${esc(data.publicEmployee||'')}">
        </div>
        <div class="form-group">
          <label>Monthly Income (₱)</label>
          <input class="m-inc" type="number" placeholder="0" value="${data.income||''}">
        </div>
      </div>
      <div class="member-grid cols2" style="margin-top:10px">
        <div class="form-group">
          <label>Other Sources of Income / Business</label>
          <input class="m-otherinc" placeholder="e.g. Sari-sari store, Remittance" value="${esc(data.otherIncome||'')}">
        </div>
      </div>
    </div>

    <div class="member-section">
      <div class="member-section-title">Government Beneficiaries &amp; Programs</div>
      <div class="member-checks">
        <label class="check-item"><input type="checkbox" class="m-scension" ${data.govScension?'checked':''}> SOCIAL PENSION</label>
        <label class="check-item"><input type="checkbox" class="m-4ps" ${data.gov4ps?'checked':''}>  4P&apos;s</label>
        <label class="check-item"><input type="checkbox" class="m-ips" ${data.govIps?'checked':''}> IP&apos;s</label>
        <label class="check-item"><input type="checkbox" class="m-mcct" ${data.govMcct?'checked':''}> MCCT</label>
        <label class="check-item"><input type="checkbox" class="m-uct" ${data.govUct?'checked':''}> UCT</label>
      </div>
    </div>

    <div class="member-section">
      <div class="member-section-title">Special Categories &amp; Classifications</div>
      <div class="member-checks">
        <label class="check-item"><input type="checkbox" class="m-sss" ${data.pensionerSSS?'checked':''}> Pensioner (SSS)</label>
        <label class="check-item"><input type="checkbox" class="m-gsis" ${data.pensionerGSIS?'checked':''}> Pensioner (GSIS)</label>
        <label class="check-item"><input type="checkbox" class="m-pwd" ${data.isPWD?'checked':''}> PWD</label>
        <label class="check-item"><input type="checkbox" class="m-solo-mother" ${data.isSoloMother?'checked':''}> Solo Parent (Mother)</label>
        <label class="check-item"><input type="checkbox" class="m-solo-father" ${data.isSoloFather?'checked':''}> Solo Parent (Father)</label>
        <label class="check-item"><input type="checkbox" class="m-ofw" ${data.isOFW?'checked':''}> OFW</label>
        <label class="check-item"><input type="checkbox" class="m-ip" ${data.isIP?'checked':''}> Indigenous Person (IP)</label>
        <label class="check-item"><input type="checkbox" class="m-voter" ${data.isVoter?'checked':''}> Registered Voter</label>
        <label class="check-item"><input type="checkbox" class="m-boarder" ${data.isBoarder?'checked':''}> Boarder</label>
        <label class="check-item"><input type="checkbox" class="m-cig" ${data.cigarette?'checked':''}> Cigarette User</label>
        <label class="check-item"><input type="checkbox" class="m-alc" ${data.alcohol?'checked':''}> Alcohol User</label>
      </div>
    </div>
  `;
  document.getElementById('members-tbody').appendChild(card);
  updateCount();
  // Scroll modal to show the new member card
  setTimeout(()=>{
    const modal = document.querySelector('#add-hh-modal .modal');
    if(modal){
      card.scrollIntoView({behavior:'smooth', block:'nearest'});
      // Also scroll the modal container to the bottom
      modal.scrollTop = modal.scrollHeight;
    } else {
      card.scrollIntoView({behavior:'smooth', block:'start'});
    }
  }, 50);
}

function esc(s){return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;')}

function calcAge(input){
  const card=input.closest('.member-card');
  const dob=new Date(input.value);
  if(!isNaN(dob)){
    const age=Math.floor((new Date()-dob)/(365.25*24*3600*1000));
    card.querySelector('.m-age').value=age;
  }
}

function delCard(btn){btn.closest('.member-card').remove();updateCount();}
function updateCount(){document.getElementById('member-count').textContent=document.querySelectorAll('#members-tbody .member-card').length;}

function getMemberData(){
  return [...document.querySelectorAll('#members-tbody .member-card')].map(card=>({
    lastName:        card.querySelector('.m-ln').value.trim(),
    firstName:       card.querySelector('.m-fn').value.trim(),
    middleName:      card.querySelector('.m-mn').value.trim(),
    ext:             card.querySelector('.m-ext').value.trim(),
    placeOfBirth:    card.querySelector('.m-pob').value.trim(),
    dateOfBirth:     card.querySelector('.m-dob').value,
    age:             card.querySelector('.m-age').value,
    sex:             card.querySelector('.m-sex').value,
    civilStatus:     card.querySelector('.m-cs').value,
    citizenship:     card.querySelector('.m-cit').value,
    religion:        card.querySelector('.m-rel').value.trim(),
    education:       card.querySelector('.m-edu').value,
    school:          card.querySelector('.m-school').value.trim(),
    schoolStatus:    card.querySelector('.m-schoolstatus').value,
    birthCert:       card.querySelector('.m-birthcert').value,
    houseOwnership:  card.querySelector('.m-house').value,
    houseType:       card.querySelector('.m-housetype').value,
    waterSource:     card.querySelector('.m-water').value,
    toiletType:      card.querySelector('.m-toilet').value,
    lotStatus:       card.querySelector('.m-lot').value,
    occupation:      card.querySelector('.m-occ').value.trim(),
    privateEmployee: card.querySelector('.m-privemp').value.trim(),
    publicEmployee:  card.querySelector('.m-pubexp').value.trim(),
    income:          card.querySelector('.m-inc').value,
    otherIncome:     card.querySelector('.m-otherinc').value.trim(),
    govScension:     card.querySelector('.m-scension').checked,
    gov4ps:          card.querySelector('.m-4ps').checked,
    govIps:          card.querySelector('.m-ips').checked,
    govMcct:         card.querySelector('.m-mcct').checked,
    govUct:          card.querySelector('.m-uct').checked,
    pensionerSSS:    card.querySelector('.m-sss').checked,
    pensionerGSIS:   card.querySelector('.m-gsis').checked,
    isPWD:           card.querySelector('.m-pwd').checked,
    isSoloMother:    card.querySelector('.m-solo-mother').checked,
    isSoloFather:    card.querySelector('.m-solo-father').checked,
    isSoloParent:    card.querySelector('.m-solo-mother').checked || card.querySelector('.m-solo-father').checked,
    isOFW:           card.querySelector('.m-ofw').checked,
    isIP:            card.querySelector('.m-ip').checked,
    isVoter:         card.querySelector('.m-voter').checked,
    isBoarder:       card.querySelector('.m-boarder').checked,
    cigarette:       card.querySelector('.m-cig').checked,
    alcohol:         card.querySelector('.m-alc').checked,
    special: buildSpecial(card),
  }));
}

function buildSpecial(card){
  const arr=[];
  if(card.querySelector('.m-pwd').checked) arr.push('PWD');
  if(card.querySelector('.m-solo-mother').checked) arr.push('Solo Parent (Mother)');
  if(card.querySelector('.m-solo-father').checked) arr.push('Solo Parent (Father)');
  if(card.querySelector('.m-ofw').checked) arr.push('OFW');
  if(card.querySelector('.m-ip').checked) arr.push('IP');
  if(card.querySelector('.m-scension').checked) arr.push('SOCIAL PENSION');
  if(card.querySelector('.m-4ps').checked) arr.push("4P's");
  if(card.querySelector('.m-mcct').checked) arr.push('MCCT');
  if(card.querySelector('.m-uct').checked) arr.push('UCT');
  const occ=card.querySelector('.m-occ').value.trim().toLowerCase();
  if(occ) arr.push('Labor/Employed');
  return arr;
}

function saveHousehold(){
  const members=getMemberData();
  if(!members.length){toast('Add at least one member!');return;}
  if(!members[0].lastName){toast('Please enter the household head\'s name!');return;}
  const purok=document.getElementById('f-address').value.trim();
  if(!purok){toast('Please select a Purok!');return;}

  const isEdit = !!editingHHId;
  const hh={
    id: isEdit ? editingHHId : nextHID(),
    region:   document.getElementById('f-region').value.trim(),
    province: document.getElementById('f-province').value.trim(),
    city:     document.getElementById('f-city').value.trim(),
    barangay: document.getElementById('f-barangay').value.trim(),
    address:  purok,
    hhNo:     (()=>{
      const manual = document.getElementById('f-hno').value.trim();
      if(manual) return manual;
      return nextHHNo(purok);
    })(),
    lotOwner: '',
    lotSite:  '',
    members,
    createdAt: new Date().toISOString()
  };

  if(isEdit){
    const idx = DB.findIndex(h=>h.id===editingHHId);
    const savedId = editingHHId;
    if(idx>=0) DB[idx]=hh; else DB.push(hh);
    editingHHId = null;
    save();
    clearForm();
    document.getElementById('f-hid').value=nextHID();
    closeAddModal();
    renderDashboard();
    updateBadge();
    // Go back to the household detail view, not the list
    showPage('detail', null);
    viewHousehold(savedId);
    toast('✅ Household updated successfully!');
  } else {
    DB.push(hh);
    save();
    clearForm();
    document.getElementById('f-hid').value=nextHID();
    closeAddModal();
    renderDashboard();
    updateBadge();
    showPage('records', document.querySelector('.nav-item[data-page="records"]'));
    renderRecords();
    const filterSel = document.getElementById('filter-barangay');
    if(filterSel){ filterSel.value = purok; renderRecords(); }
    toast('✅ Household saved successfully!');
  }
}

function clearForm(){
  ['f-hno'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-address').value='';
  document.getElementById('members-tbody').innerHTML='';
  memberRows=0;
  updateCount();
}

// ══════════════════════════════════════════════════════════════
// PUROK PAGE
// ══════════════════════════════════════════════════════════════
function showSectorMembers(sectorKey, sectorLabel){
  const allMembers = DB.flatMap(hh=>hh.members.map(m=>({...m,_hhId:hh.id,_hhAddr:hh.address,_hhNo:hh.hhNo||hh.id})));

  let filtered;
  if(sectorKey==='__senior__')       filtered = allMembers.filter(m=>+m.age>=60);
  else if(sectorKey==='__labor__')   filtered = allMembers.filter(m=>m.occupation&&m.occupation.trim()!='');
  else if(sectorKey==='__unemployed__') filtered = allMembers.filter(m=>!m.occupation||m.occupation.trim()==='');
  else if(sectorKey==='__osc__')     filtered = allMembers.filter(m=>{const a=+m.age;return a>=0&&a<=5&&m.schoolStatus!=='In School';});
  else if(sectorKey==='__osy__')     filtered = allMembers.filter(m=>{const a=+m.age;return a>=15&&a<=24&&(!m.occupation||m.occupation.trim()==='')&&m.schoolStatus!=='In School';});
  else filtered = allMembers.filter(m=>m.special&&m.special.some(sp=>sp.toLowerCase().includes(sectorKey.toLowerCase())||sectorKey.toLowerCase().includes(sp.toLowerCase())));

  const rows = filtered.map(m=>{
    const name = `${m.lastName||'—'}, ${m.firstName||'—'} ${m.middleName?m.middleName[0]+'.':''}`.trim();
    const tags = (m.special||[]).map(sp=>`<span class="badge badge-blue" style="font-size:10px;margin-right:2px">${sp}</span>`).join('');
    return `<tr style="cursor:pointer" onclick="viewHousehold('${m._hhId}')">
      <td style="border:1px solid var(--border);padding:7px 10px;color:var(--navy);font-weight:600">${name}</td>
      <td style="border:1px solid var(--border);padding:7px 10px;text-align:center">${m.age||'—'}</td>
      <td style="border:1px solid var(--border);padding:7px 10px;text-align:center">${m.sex||'—'}</td>
      <td style="border:1px solid var(--border);padding:7px 10px">${m._hhAddr||'—'}</td>
      <td style="border:1px solid var(--border);padding:7px 10px;font-size:12px;color:var(--muted)">${m._hhNo||'—'}</td>
      <td style="border:1px solid var(--border);padding:7px 10px">${tags||'<span style="color:var(--muted);font-size:11px">—</span>'}</td>
    </tr>`;
  }).join('');

  document.getElementById('purok-body').innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="showPage('dashboard',null);renderDashboard()">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
        Back to Dashboard
      </button>
      <h2 style="font-size:17px;color:var(--navy);font-family:'Source Serif 4',serif">${sectorLabel}</h2>
      <span style="font-size:12px;color:var(--muted)">&mdash; ${filtered.length} member(s)</span>
    </div>
    ${filtered.length===0?`<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><p>No members found for this sector.</p></div>`:`
    <div class="card" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr>
            <th style="background:var(--navy);color:#fff;padding:9px 12px;text-align:left;font-size:11px;letter-spacing:.4px">NAME</th>
            <th style="background:var(--navy);color:#fff;padding:9px 12px;text-align:center;font-size:11px">AGE</th>
            <th style="background:var(--navy);color:#fff;padding:9px 12px;text-align:center;font-size:11px">SEX</th>
            <th style="background:var(--navy);color:#fff;padding:9px 12px;text-align:left;font-size:11px">PUROK</th>
            <th style="background:var(--navy);color:#fff;padding:9px 12px;text-align:left;font-size:11px">HH NO.</th>
            <th style="background:var(--navy);color:#fff;padding:9px 12px;text-align:left;font-size:11px">SECTORS</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`}
  `;
  showPage('purok', null);
  document.getElementById('topbar-title').textContent = sectorLabel;
  document.getElementById('topbar-sub').textContent = filtered.length+' member(s) · Click a row to view household';
}

function showPurokPage(purok){
  const hhList = purok==='ALL' ? DB : DB.filter(hh=>hh.address===purok);
  const allMem = hhList.flatMap(hh=>hh.members);
  const title = purok==='ALL' ? 'All Households' : 'Purok '+purok;

  let rows = '';
  hhList.forEach(hh=>{
    const head = hh.members[0];
    const headName = head ? `${head.lastName}, ${head.firstName} ${head.middleName?head.middleName[0]+'.':''}`.trim() : '—';
    // Head row
    rows += `<tr style="background:#fdf7e8;font-weight:600;cursor:pointer" onclick="_detailOrigin='purok';_detailOriginPurok='${purok}';viewHousehold('${hh.id}')">
      <td style="border:1px solid var(--border);padding:7px 10px;color:var(--navy)">${hh.hhNo||hh.id}</td>
      <td style="border:1px solid var(--border);padding:7px 10px">${hh.address||'—'}</td>
      <td style="border:1px solid var(--border);padding:7px 10px">
        ${headName}
        <span style="font-size:9px;background:var(--gold);color:var(--navydk);padding:1px 6px;border-radius:3px;font-weight:700;margin-left:4px">HEAD</span>
      </td>
      <td style="border:1px solid var(--border);padding:7px 10px;text-align:center">${head?head.age||'—':'—'}</td>
      <td style="border:1px solid var(--border);padding:7px 10px;text-align:center">${head?head.sex||'—':'—'}</td>
      <td style="border:1px solid var(--border);padding:7px 10px;text-align:center">${hh.members.length}</td>
    </tr>`;
    // Member rows
    hh.members.slice(1).forEach((m, mi)=>{
      const mIdx = mi + 1; // actual index in hh.members
      const mName = `${m.lastName||'—'}, ${m.firstName||'—'} ${m.middleName?m.middleName[0]+'.':''}`.trim();
      rows += `<tr style="cursor:pointer" onclick="_detailOrigin='purok';_detailOriginPurok='${purok}';viewHousehold('${hh.id}', ${mIdx})">
        <td style="border:1px solid var(--border);padding:5px 10px;color:var(--muted);font-size:12px"></td>
        <td style="border:1px solid var(--border);padding:5px 10px;font-size:12px;color:var(--muted)"></td>
        <td style="border:1px solid var(--border);padding:5px 10px;padding-left:28px;font-size:12.5px">
          <span style="color:var(--muted);font-size:10px;margin-right:4px">└</span>${mName}
        </td>
        <td style="border:1px solid var(--border);padding:5px 10px;text-align:center;font-size:12px">${m.age||'—'}</td>
        <td style="border:1px solid var(--border);padding:5px 10px;text-align:center;font-size:12px">${m.sex||'—'}</td>
        <td style="border:1px solid var(--border);padding:5px 10px;text-align:center;font-size:12px"></td>
      </tr>`;
    });
  });

  document.getElementById('purok-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="showPage('dashboard',null);renderDashboard()">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
        Back to Dashboard
      </button>
      <h2 style="font-size:17px;color:var(--navy);font-family:'Source Serif 4',serif">${title}</h2>
      <span style="font-size:12px;color:var(--muted)">&mdash; ${hhList.length} household(s), ${allMem.length} inhabitant(s)</span>
    </div>
    <div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--navy);color:#fff">
            <th style="padding:9px 10px;text-align:left;font-size:11px;letter-spacing:.4px">HH No.</th>
            <th style="padding:9px 10px;text-align:left;font-size:11px">Purok</th>
            <th style="padding:9px 10px;text-align:left;font-size:11px">Name</th>
            <th style="padding:9px 10px;text-align:center;font-size:11px">Age</th>
            <th style="padding:9px 10px;text-align:center;font-size:11px">Sex</th>
            <th style="padding:9px 10px;text-align:center;font-size:11px">Members</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">No households found.</td></tr>'}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-purok').classList.add('active');
  // Activate Household Records nav item + open dropdown
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.nav-sub-item').forEach(n=>n.classList.remove('active'));
  const hhToggle = document.querySelector('.nav-dropdown-toggle');
  const hhDropdown = document.getElementById('hh-dropdown');
  if(hhToggle){ hhToggle.classList.add('active','open'); }
  if(hhDropdown){ hhDropdown.classList.add('open'); }
  // Highlight the correct purok in the sidebar
  document.querySelectorAll('.nav-year-item').forEach(n=>n.classList.remove('active'));
  const allEl = document.getElementById('nav-all-puroks');
  if(purok === 'ALL'){
    if(allEl) allEl.classList.add('active');
  } else {
    // Find the matching nav-year-item by text content
    document.querySelectorAll('.nav-year-item').forEach(n=>{
      if(n.textContent.trim().startsWith(purok)) n.classList.add('active');
    });
  }
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-sub').textContent = hhList.length+' households · '+allMem.length+' inhabitants';
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-gold btn-sm" onclick="showPage('records',null);renderRecords();document.getElementById('filter-barangay').value='${purok==='ALL'?'':purok}';renderRecords()">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm1 3v1h8V5H4zm0 3v1h8V8H4zm0 3v1h5v-1H4z"/></svg>
      Open in Records
    </button>`;
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
function renderDashboard(){
  const allMembers=DB.flatMap(hh=>hh.members);
  const males=allMembers.filter(m=>m.sex==='Male').length;
  const females=allMembers.filter(m=>m.sex==='Female').length;
  const pwds=allMembers.filter(m=>m.isPWD).length;
  const osys=allMembers.filter(m=>{const a=+m.age;return a>=15&&a<=24&&!m.occupation;}).length;
  const seniors=allMembers.filter(m=>+m.age>=60).length;
  const seniorMale=allMembers.filter(m=>+m.age>=60&&m.sex==='Male').length;
  const seniorFemale=allMembers.filter(m=>+m.age>=60&&m.sex==='Female').length;

  const puroks=['ALMASIGA','APITONG','LAWAAN A','LAWAAN B','MOLAVE','NARRA','TANGUILE','YAKAL'];
  const purokCounts = puroks.map(p=>({
    name:p,
    hh: DB.filter(hh=>hh.address===p).length,
    pop: DB.filter(hh=>hh.address===p).reduce((s,hh)=>s+hh.members.length,0)
  }));

  document.getElementById('stats-grid').innerHTML=`
    <div class="stat-card" style="cursor:pointer" onclick="showPurokPage('ALL')">
      <div class="stat-label">Total Inhabitants</div>
      <div class="stat-value">${allMembers.length.toLocaleString()}</div>
      <div class="stat-sub">Click to view all households</div>
    </div>
    <div class="stat-card blue" style="cursor:pointer" onclick="goToHouseholdRecords()">
      <div class="stat-label">Households</div>
      <div class="stat-value">${DB.length}</div>
      <div class="stat-sub">Registered families</div>
    </div>
  `;

  // Purok population cards
  const purokGrid = document.getElementById('purok-stats-grid');
  if(purokGrid){
    purokGrid.innerHTML = purokCounts.map(p=>`
      <div class="stat-card" style="cursor:pointer;border-left-color:var(--accent)" onclick="showPurokPage('${p.name}')">
        <div class="stat-label" style="font-size:10px">Purok ${p.name}</div>
        <div class="stat-value" style="font-size:20px">${p.pop}</div>
        <div class="stat-sub">${p.hh} household${p.hh!==1?'s':''} · Click to view</div>
      </div>`).join('');
  }

  // DILG RBI brackets for dashboard age chart
  const children=allMembers.filter(m=>{const a=+m.age;return a>=0&&a<=14;}).length;  // Under 15
  const youth=allMembers.filter(m=>{const a=+m.age;return a>=15&&a<=24;}).length;     // 15-24
  const adults=allMembers.filter(m=>{const a=+m.age;return a>=25&&a<=59;}).length;    // 25-59

  // Sex chart
  const total=allMembers.length||1;
  const malePct=Math.round(males/total*100);
  const femPct=100-malePct;
  document.getElementById('sex-chart').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1px 1fr;gap:20px;align-items:start" class="sex-chart-inner">
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="width:10px;height:10px;border-radius:50%;background:var(--navy);display:inline-block"></span>
              <span style="font-size:12px;color:var(--muted);font-weight:600">Male</span>
            </div>
            <span style="font-size:13px;font-weight:700;color:var(--navy)">${males} <span style="font-size:11px;color:var(--muted);font-weight:400">(${malePct}%)</span></span>
          </div>
          <div style="background:var(--light);border-radius:6px;height:12px">
            <div style="background:var(--navy);height:12px;border-radius:6px;width:${malePct}%;transition:.4s"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="width:10px;height:10px;border-radius:50%;background:var(--gold);display:inline-block"></span>
              <span style="font-size:12px;color:var(--muted);font-weight:600">Female</span>
            </div>
            <span style="font-size:13px;font-weight:700;color:var(--navy)">${females} <span style="font-size:11px;color:var(--muted);font-weight:400">(${femPct}%)</span></span>
          </div>
          <div style="background:var(--light);border-radius:6px;height:12px">
            <div style="background:var(--gold);height:12px;border-radius:6px;width:${femPct}%;transition:.4s"></div>
          </div>
        </div>
      </div>
      <div style="background:var(--border);align-self:stretch" class="sex-divider"></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Age Groups</div>
        ${[
          {label:'Children / Youth (under 15)',sub:'0 – 14 yrs',count:children,color:'#0891b2'},
          {label:'Youth',sub:'15 – 24 yrs',count:youth,color:'#16a34a'},
          {label:'Adults',sub:'25 – 59 yrs',count:adults,color:'var(--navy)'},
          {label:'Senior Citizens',sub:'60 yrs & above',count:seniors,color:'#7c3aed'},
        ].map(g=>{
          const pct=Math.round(g.count/total*100);
          return `<div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
              <div>
                <span style="font-size:12px;font-weight:600;color:var(--text)">${g.label}</span>
                <span style="font-size:10px;color:var(--muted);margin-left:4px">${g.sub}</span>
              </div>
              <span style="font-size:12px;font-weight:700;color:var(--navy)">${g.count} <span style="font-size:10px;color:var(--muted);font-weight:400">(${pct}%)</span></span>
            </div>
            <div style="background:var(--light);border-radius:4px;height:7px">
              <div style="background:${g.color};height:7px;border-radius:4px;width:${pct}%;transition:.4s"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  const sectors=[
    {k:'__labor__',label:'Labor Force (Employed)',color:'#0d2b5e'},
    {k:'__unemployed__',label:'Unemployed',color:'#64748b'},
    {k:'__osc__',label:'Out of School Children (0-5)',color:'#ea580c'},
    {k:'__osy__',label:'Out of School Youth (15-24)',color:'#f59e0b'},
    {k:'PWD',label:'Persons w/ Disability (PWD)',color:'#0891b2'},
    {k:'OFW',label:'Overseas Filipino Workers (OFW)',color:'#16a34a'},
    {k:'Solo Parent',label:'Solo Parents',color:'#ec4899'},
    {k:'IP',label:'Indigenous Peoples (IP)',color:'#84604f'},
    {k:'__senior__',label:'Senior Citizens (60+)',color:'#7c3aed'},
  ];
  const getSectorCount=(s)=>{
    if(s.k==='__senior__') return allMembers.filter(m=>+m.age>=60).length;
    if(s.k==='__labor__') return allMembers.filter(m=>m.occupation&&m.occupation.trim()!='').length;
    if(s.k==='__unemployed__') return allMembers.filter(m=>!m.occupation||m.occupation.trim()=='').length;
    if(s.k==='__osc__'){return allMembers.filter(m=>{const a=+m.age;return a>=0&&a<=5&&m.schoolStatus!=='In School';}).length;}
    if(s.k==='__osy__'){return allMembers.filter(m=>{const a=+m.age;return a>=15&&a<=24&&(!m.occupation||m.occupation.trim()==='')&&m.schoolStatus!=='In School';}).length;}
    return allMembers.filter(m=>m.special&&m.special.some(sp=>sp.toLowerCase().includes(s.k.toLowerCase())||s.k.toLowerCase().includes(sp.toLowerCase()))).length;
  };
  const maxSect=Math.max(...sectors.map(s=>getSectorCount(s)),1);
  document.getElementById('sector-chart').innerHTML=sectors.map(s=>{
    const cnt=getSectorCount(s);
    const pct=Math.round(cnt/maxSect*100);
    const safeKey = s.k.replace(/'/g,"\\'");
    const safeLabel = s.label.replace(/'/g,"\\'");
    const clickAttr = cnt>0 ? 'onclick="showSectorMembers(\''+safeKey+'\',\''+safeLabel+'\')" style="margin-bottom:8px;cursor:pointer"' : 'style="margin-bottom:8px"';
    const labelColor = cnt>0 ? 'var(--accent)' : 'var(--muted)';
    const labelWeight = cnt>0 ? '600' : '400';
    const arrow = cnt>0 ? ' <span style="font-size:10px;opacity:.7">&#9654;</span>' : '';
    return '<div '+clickAttr+'>'
      +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">'
      +'<span style="color:'+labelColor+';font-weight:'+labelWeight+'">'+s.label+arrow+'</span>'
      +'<strong style="color:'+(cnt>0?'var(--navy)':'var(--muted)')+'">'+cnt+'</strong>'
      +'</div>'
      +'<div style="background:var(--light);border-radius:4px;height:7px">'
      +'<div style="background:'+s.color+';height:7px;border-radius:4px;width:'+pct+'%;transition:width .3s"></div>'
      +'</div></div>';
  }).join('');

  const recent=DB.slice(-5).reverse();
  document.getElementById('recent-households').innerHTML=recent.length?recent.map(hh=>{
    const head=hh.members[0];
    const hn=head?`${head.lastName}, ${head.firstName}`:'No members';
    return `<div class="record-card" onclick="viewHousehold('${hh.id}')">
      <div class="record-avatar">${(hh.address||'P')[0].toUpperCase()}</div>
      <div class="record-info">
        <div class="record-name">${hn} <span class="badge badge-head">HEAD</span> <span class="badge badge-gray" style="font-size:10px">${hh.id}</span></div>
        <div class="record-meta">Purok ${hh.address||'—'} · Brgy. Pangabugan · ${hh.members.length} member(s)</div>
      </div>
      <span class="badge badge-blue">${hh.members.length} member${hh.members.length!==1?'s':''}</span>
    </div>`;
  }).join(''):`<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9.5L12 3l9 6.5V21H3V9.5z"/></svg><p>No households yet. Add your first household!</p></div>`;
}

// ══════════════════════════════════════════════════════════════
// RECORDS
// ══════════════════════════════════════════════════════════════
let bulkMode = false;
let selectedIds = new Set();
let activeYearFilter = ''; // '' = All Years (kept for renderRecords compat)
let activePurokFilter = ''; // '' = All Puroks

function enterBulkMode(){
  bulkMode = true;
  selectedIds.clear();
  document.getElementById('bulk-select-all-wrap').style.display='flex';
  document.getElementById('bulk-toggle-btn').style.display='none';
  document.getElementById('select-all-cb').checked=false;
  updateSelectedCount();
  renderRecords();
}

function exitBulkMode(){
  bulkMode = false;
  selectedIds.clear();
  document.getElementById('bulk-top-bar').style.display='none';
  document.getElementById('bulk-select-all-wrap').style.display='none';
  document.getElementById('bulk-toggle-btn').style.display='';
  document.getElementById('select-all-cb').checked=false;
  renderRecords();
}

function toggleSelectAll(checked){
  const checkboxes = document.querySelectorAll('.hh-cb');
  checkboxes.forEach(cb=>{
    cb.checked=checked;
    if(checked) selectedIds.add(cb.dataset.id);
    else selectedIds.delete(cb.dataset.id);
  });
  updateSelectedCount();
}

function onHHCheck(cb){
  if(cb.checked) selectedIds.add(cb.dataset.id);
  else selectedIds.delete(cb.dataset.id);
  const all = document.querySelectorAll('.hh-cb');
  document.getElementById('select-all-cb').checked = all.length>0 && [...all].every(c=>c.checked);
  updateSelectedCount();
}

function updateSelectedCount(){
  const n = selectedIds.size;
  document.getElementById('selected-count').textContent = n+' selected';
  document.getElementById('bulk-top-bar').style.display = n>0 ? 'flex' : 'none';
}

function deleteSelected(){
  if(!selectedIds.size){ toast('No households selected.'); return; }
  document.getElementById('bulk-delete-count-label').innerHTML =
    '🗑 <strong>' + selectedIds.size + ' household' + (selectedIds.size!==1?'s':'') + '</strong> selected for deletion';
  document.getElementById('bulk-delete-confirm-modal').classList.add('open');
}

function closeBulkDeleteModal(){
  document.getElementById('bulk-delete-confirm-modal').classList.remove('open');
}

function executeBulkDelete(){
  const count = selectedIds.size;
  DB = DB.filter(hh=>!selectedIds.has(hh.id));
  save(); renderDashboard(); updateBadge();
  closeBulkDeleteModal();
  toast('🗑 ' + count + ' household(s) deleted.');
  exitBulkMode();
}

function goToHouseholdRecords(){
  activePurokFilter = '';
  const fb = document.getElementById('filter-barangay');
  if(fb) fb.value = '';
  populatePurokFilter();
  showPage('records', null);
  renderRecords();
  // Activate "Household Records" nav item and open dropdown
  const dd = document.getElementById('hh-dropdown');
  const toggle = document.querySelector('.nav-dropdown-toggle');
  if(dd) dd.classList.add('open');
  if(toggle) toggle.classList.add('open');
  // Set "All Purok" as active
  const allEl = document.getElementById('nav-all-puroks');
  document.querySelectorAll('.nav-sub-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.nav-year-item').forEach(n=>n.classList.remove('active'));
  if(allEl) allEl.classList.add('active');
  // Activate parent nav item
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const hhToggle = document.querySelector('.nav-dropdown-toggle');
  if(hhToggle) hhToggle.classList.add('active');
}

function filterByPurok(purok){
  activePurokFilter = purok;
  // also sync the filter-barangay dropdown
  const fb = document.getElementById('filter-barangay');
  if(fb) fb.value = purok;
  populatePurokFilter();
  showPage('records', null);
  renderRecords();
  // Auto-open dropdown
  const dd = document.getElementById('hh-dropdown');
  const toggle = document.querySelector('.nav-dropdown-toggle');
  if(dd) dd.classList.add('open');
  if(toggle) { toggle.classList.add('open'); toggle.classList.add('active'); }
  document.querySelectorAll('.nav-item').forEach(n=>{ if(n!==toggle) n.classList.remove('active'); });
}

function filterByYear(year){
  activeYearFilter = year;
  showPage('records', null);
  renderRecords();
  const dd = document.getElementById('hh-dropdown');
  const toggle = document.querySelector('.nav-dropdown-toggle');
  if(dd) dd.classList.add('open');
  if(toggle) toggle.classList.add('open');
}

function populatePurokFilter(){
  const container = document.getElementById('nav-purok-items');
  if(!container) return;

  const puroks = ['ALMASIGA','APITONG','LAWAAN A','LAWAAN B','MOLAVE','NARRA','TANGUILE','YAKAL'];

  // Update "All Purok" count
  const allEl = document.getElementById('nav-all-puroks');
  if(allEl){
    const cnt = document.getElementById('nav-all-puroks-count');
    if(cnt) cnt.textContent = DB.length;
    allEl.classList.toggle('active', activePurokFilter==='');
  }

  // Purok items
  container.innerHTML = puroks.map(p=>{
    const cnt = DB.filter(hh=>hh.address===p).length;
    return `
    <div class="nav-year-item ${p===activePurokFilter?'active':''}"
         onclick="filterByPurok('${p}');setActivePurokItem(this)">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1C5.2 1 3 3.2 3 6c0 3.5 5 9 5 9s5-5.5 5-9c0-2.8-2.2-5-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z"/></svg>
      ${p}
      <span class="nav-year-count">${cnt}</span>
    </div>`;
  }).join('');
}

function populateYearFilter(){
  populatePurokFilter();
}

function setActivePurokItem(el){
  document.querySelectorAll('.nav-year-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.nav-sub-item').forEach(n=>n.classList.remove('active'));
  const allEl = document.getElementById('nav-all-puroks');
  if(allEl) allEl.classList.remove('active');
  el.classList.add('active');
}

function setActiveYearItem(el){
  setActivePurokItem(el);
}

function renderRecords(){
  populateYearFilter();
  const q=(document.getElementById('search-input')||{}).value||'';
  const fp=(document.getElementById('filter-barangay')||{}).value||'';
  const fy = activeYearFilter;
  const filtered=DB.filter(hh=>{
    const txt=(hh.id+' '+hh.address+' '+hh.members.map(m=>m.lastName+' '+m.firstName).join(' ')).toLowerCase();
    const hhYear = hh.createdAt ? String(new Date(hh.createdAt).getFullYear()) : '';
    return (!q||txt.includes(q.toLowerCase()))&&(!fp||hh.address===fp)&&(!fy||hhYear===String(fy));
  });
  const el=document.getElementById('records-list');
  // Show/hide purok banner
  const banner = document.getElementById('year-filter-banner');
  const bannerLabel = document.getElementById('year-filter-label');
  if(banner && bannerLabel){
    if(fp){
      banner.style.display='flex';
      bannerLabel.textContent='Showing Purok '+fp+' ('+filtered.length+' record'+(filtered.length!==1?'s':'')+')';
    } else {
      banner.style.display='none';
    }
  }
  if(!filtered.length){
    el.innerHTML=`<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><p>No records found.</p></div>`;
    return;
  }
  filtered.sort((a,b)=>{
    const aHead=a.members[0];const bHead=b.members[0];
    const aName=(aHead?aHead.lastName||'':'').toUpperCase();
    const bName=(bHead?bHead.lastName||'':'').toUpperCase();
    return aName.localeCompare(bName);
  });
  el.innerHTML=filtered.map(hh=>{
    const head=hh.members[0];
    const headName=head?`${head.lastName}, ${head.firstName} ${head.middleName?head.middleName[0]+'.':''}`.trim():'No members';
    const cbHtml = bulkMode
      ? `<input type="checkbox" class="hh-cb" data-id="${hh.id}" ${selectedIds.has(hh.id)?'checked':''} onchange="onHHCheck(this)" onclick="event.stopPropagation()" style="width:18px;height:18px;accent-color:var(--navy);cursor:pointer;flex-shrink:0">`
      : '';
    return `<div class="record-card" onclick="${bulkMode?`document.querySelector('.hh-cb[data-id=\\'${hh.id}\\']').click()`:`_detailOrigin='records';viewHousehold('${hh.id}')`}">
      ${cbHtml}
      <div class="record-avatar">${(hh.address||'P')[0].toUpperCase()}</div>
      <div class="record-info">
        <div class="record-name">${headName} <span class="badge badge-head" style="font-size:10px">HEAD</span> <span class="badge badge-gray" style="font-size:10px">${hh.id}</span></div>
        <div class="record-meta">Purok ${hh.address||'—'} · Brgy. Pangabugan · Butuan City${hh.createdAt?' · <span style="color:var(--accent);font-weight:600">'+new Date(hh.createdAt).getFullYear()+'</span>':''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="badge badge-blue">${hh.members.length} member${hh.members.length!==1?'s':''}</div>
        ${hh.members.some(m=>m.isDeceased)?`<div class="badge" style="background:#fee2e2;color:#b91c1c;margin-top:4px">🕊 ${hh.members.filter(m=>m.isDeceased).length} deceased</div>`:''}
        ${!bulkMode?`<div style="margin-top:6px;display:flex;gap:6px">
          <button class="btn btn-excel btn-sm" onclick="event.stopPropagation();exportHouseholdExcel('${hh.id}')">Export XLS</button>
          <button class="btn btn-sm btn-success" onclick="event.stopPropagation();editHousehold('${hh.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteHousehold('${hh.id}')">Delete</button>
        </div>`:''}
      </div>
    </div>`;
  }).join('');
}

let _deleteTargetId = null;
let _deleteMemberIdx = null;

function deleteHousehold(id){
  // Called from the records list — delete whole household
  const hh = DB.find(h=>h.id===id);
  if(!hh) return;
  _deleteTargetId = id;
  _deleteMemberIdx = null; // null = delete whole household
  const headName = hh.members[0] ? (hh.members[0].lastName||'') + ', ' + (hh.members[0].firstName||'') : '—';
  document.getElementById('delete-modal-title').textContent = 'Delete Household';
  document.getElementById('delete-modal-desc').textContent = 'Are you sure you want to delete this entire household record? All member data will be permanently removed.';
  document.getElementById('delete-confirm-name').innerHTML =
    '🏠 <strong>' + hh.id + '</strong> &nbsp;·&nbsp; ' + headName + ' &nbsp;<span style="font-size:11px;color:var(--muted)">(' + hh.members.length + ' member' + (hh.members.length!==1?'s':'') + ')</span>';
  document.getElementById('delete-confirm-modal').classList.add('open');
}

function deleteMember(hhId, memberIdx){
  // Called from the detail page — delete only the selected member
  const hh = DB.find(h=>h.id===hhId);
  if(!hh) return;
  const m = hh.members[memberIdx];
  if(!m) return;
  _deleteTargetId = hhId;
  _deleteMemberIdx = memberIdx;
  const memberName = (m.lastName||'—') + ', ' + (m.firstName||'—') + (m.middleName?' '+m.middleName:'');
  const isHead = memberIdx === 0;
  document.getElementById('delete-modal-title').textContent = 'Delete Member';
  document.getElementById('delete-modal-desc').textContent = isHead && hh.members.length > 1
    ? 'This member is the Household Head. Deleting them will promote the next member as the new head.'
    : hh.members.length === 1
      ? 'This is the only member. Deleting them will also remove the entire household record.'
      : 'Are you sure you want to remove this member from the household?';
  document.getElementById('delete-confirm-name').innerHTML =
    '👤 <strong>' + memberName + '</strong>' +
    (isHead ? ' &nbsp;<span style="font-size:10px;background:var(--gold);color:var(--navydk);padding:2px 7px;border-radius:3px;font-weight:700">HEAD</span>' : '') +
    ' &nbsp;<span style="font-size:11px;color:var(--muted)">' + (m.sex||'') + (m.age?', '+m.age+' yrs':'') + '</span>';
  document.getElementById('delete-confirm-modal').classList.add('open');
}

function closeDeleteModal(){
  document.getElementById('delete-confirm-modal').classList.remove('open');
  _deleteTargetId = null;
  _deleteMemberIdx = null;
}

function executeDelete(){
  if(!_deleteTargetId) return;
  const hh = DB.find(h=>h.id===_deleteTargetId);
  if(!hh){ closeDeleteModal(); return; }

  if(_deleteMemberIdx === null){
    // Delete whole household (from records list)
    DB = DB.filter(h=>h.id!==_deleteTargetId);
    save(); renderDashboard(); renderRecords(); updateBadge();
    closeDeleteModal();
    showPage('records', document.querySelector('.nav-item[data-page="records"]'));
    renderRecords();
    toast('🗑 Household deleted.');
  } else {
    // Delete single member
    const idx = _deleteMemberIdx;
    hh.members.splice(idx, 1);

    if(hh.members.length === 0){
      // No members left — remove whole household
      DB = DB.filter(h=>h.id!==_deleteTargetId);
      save(); renderDashboard(); updateBadge();
      closeDeleteModal();
      showPage('records', document.querySelector('.nav-item[data-page="records"]'));
      renderRecords();
      toast('🗑 Member deleted — household removed (no remaining members).');
    } else {
      save(); renderDashboard(); updateBadge();
      const hhId = _deleteTargetId;
      closeDeleteModal();
      viewHousehold(hhId);
      // select first member after delete
      setTimeout(()=>selectMember(0), 80);
      toast('🗑 Member deleted.');
    }
  }
}

let editingHHId = null; // track which HH is being edited

function editHousehold(id){
  const hh=DB.find(h=>h.id===id);
  if(!hh) return;
  editingHHId = id; // remember, but do NOT remove from DB yet
  document.getElementById('f-region').value=hh.region||'';
  document.getElementById('f-province').value=hh.province||'';
  document.getElementById('f-city').value=hh.city||'';
  document.getElementById('f-barangay').value=hh.barangay||'';
  document.getElementById('f-address').value=hh.address||'';
  document.getElementById('f-hno').value=hh.hhNo||'';
  document.getElementById('f-hid').value=hh.id;
  document.getElementById('members-tbody').innerHTML='';
  memberRows=0;
  hh.members.forEach(m=>addMemberRow(m));
  openAddModal(true);
  toast('Editing household. Re-save when done.');
}

// ══════════════════════════════════════════════════════════════
// VIEW DETAIL PAGE
// ══════════════════════════════════════════════════════════════
function goBackFromDetail(){
  if(_detailOrigin === 'purok'){
    showPurokPage(_detailOriginPurok || 'ALL');
  } else {
    showPage('records', null);
    renderRecords();
  }
  _detailOrigin = null;
  _detailOriginPurok = null;
}

function viewHousehold(id, memberIdx){
  currentViewId=id;
  const hh=DB.find(h=>h.id===id);
  if(!hh) return;

  const viewField=(label,val)=>`
    <div style="display:flex;flex-direction:column;gap:3px">
      <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${label}</div>
      <div style="font-size:13px;color:var(--text);font-weight:500">${val||'<span style="color:#bbb">—</span>'}</div>
    </div>`;

  const viewCheck=(label,val)=>val
    ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#dbeafe;color:#1e40af;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;margin:2px">${label}</span>`
    : '';

  const section=(title,content)=>
    '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px">'
    + '<div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.9px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid var(--light)">'+title+'</div>'
    + content
    + '</div>';

  const grid=(cols,...fields)=>'<div style="display:grid;grid-template-columns:repeat('+cols+',1fr);gap:10px">'+fields.join('')+'</div>';

  document.getElementById('detail-body').innerHTML=`
    <!-- ACTION BAR -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="goBackFromDetail()">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
        Back
      </button>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-excel btn-sm" onclick="exportHouseholdExcel('${hh.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/></svg>
          Export Excel
        </button>
        <button class="btn btn-success btn-sm" onclick="editCurrentMember('${hh.id}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M11.7 2.3a1 1 0 011.4 1.4L4.4 12.4l-2.1.6.6-2.1 8.8-8.6z"/></svg>
          Edit
        </button>
        <button class="btn btn-sm" style="background:#6b21a8;color:#fff;border:none" onclick="openDeceasedModal('${hh.id}')">🕊 Deceased</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMember('${hh.id}', currentMemberIdx)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Delete Member
        </button>
      </div>
    </div>

    <!-- MAIN LAYOUT: LEFT + RIGHT -->
    <div style="display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:start">

      <!-- LEFT PANEL -->
      <div>
        <!-- Household Info -->
        <div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:12px">
          <div style="background:var(--navy);padding:12px 16px">
            <div style="font-size:10px;color:var(--goldlt);letter-spacing:.8px;text-transform:uppercase;font-weight:600">Household</div>
            <div style="font-size:16px;font-weight:700;color:#fff;font-family:'Source Serif 4',serif;margin-top:2px">${hh.id}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:2px">HH No: ${hh.hhNo||'—'}</div>
          </div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            ${viewField('Region', hh.region)}
            ${viewField('Province', hh.province)}
            ${viewField('City / Municipality', hh.city)}
            ${viewField('Barangay', hh.barangay)}
            ${viewField('Purok / Zone / Street', hh.address)}
            ${viewField('HH No.', hh.hhNo)}
          </div>
          <div style="padding:0 16px 14px 16px;border-top:1px solid var(--border);margin-top:0">
            <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin:12px 0 8px">House &amp; Lot Info</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              ${viewField('House Ownership', hh.members[0]&&hh.members[0].houseOwnership)}
              ${viewField('Type of House', hh.members[0]&&hh.members[0].houseType)}
              ${viewField('Water Source', hh.members[0]&&hh.members[0].waterSource)}
              ${viewField('Type of Toilet', hh.members[0]&&hh.members[0].toiletType)}
              ${viewField('Lot Status', hh.members[0]&&hh.members[0].lotStatus)}
            </div>
          </div>
        </div>

        <!-- Members List -->
        <div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden">
          <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.5px">Members</span>
            <span style="font-size:11px;background:var(--navy);color:#fff;padding:2px 8px;border-radius:20px;font-weight:600">${hh.members.length}</span>
          </div>
          <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
            ${hh.members.map((m,i)=>`
              <div class="member-item-clickable ${i===0?'member-active':''}" id="member-item-${i}" onclick="selectMember(${i})" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:${i===0?'#fef9ec':m.isDeceased?'#fef2f2':'#f8faff'};border:1px solid ${i===0?'var(--gold)':m.isDeceased?'#fca5a5':'var(--border)'}">
                <div style="width:30px;height:30px;border-radius:50%;background:${m.isDeceased?'#9ca3af':i===0?'var(--gold)':'var(--navy)'};color:${i===0&&!m.isDeceased?'var(--navydk)':'#fff'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${m.isDeceased?'✝':i+1}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;color:${m.isDeceased?'#6b7280':'var(--navy)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${m.isDeceased?'text-decoration:line-through':''}">${m.lastName||'—'}, ${m.firstName||'—'}</div>
                  <div style="font-size:11px;color:var(--muted)">${m.isDeceased?'<span style="color:#b91c1c;font-weight:600">DECEASED'+(m.dateOfDeath?' · '+m.dateOfDeath:'')+'</span>':m.sex+'·'+m.age+' yrs'}</div>
                </div>
                ${i===0&&!m.isDeceased?'<span style="font-size:9px;background:var(--gold);color:var(--navydk);padding:2px 6px;border-radius:3px;font-weight:700;flex-shrink:0">HEAD</span>':''}
                ${m.isDeceased?'<span style="font-size:9px;background:#fee2e2;color:#b91c1c;padding:2px 6px;border-radius:3px;font-weight:700;flex-shrink:0">🕊</span>':''}
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- RIGHT PANEL: member detail cards -->
      <div id="member-detail-panel">
        ${hh.members.map((m,i)=>`
          <div id="member-detail-${i}" class="member-detail-card" style="display:${i===0?'block':'none'};background:${m.isDeceased?'#fef2f2':i===0?'#fdf7e8':'#f3f6fb'};border:${m.isDeceased?'2px solid #fca5a5':i===0?'2px solid var(--gold)':'1px solid var(--border)'};border-radius:12px;padding:16px;margin-bottom:14px">

            <!-- Deceased Banner -->
            ${m.isDeceased?`<div style="background:#fca5a5;color:#7f1d1d;padding:10px 14px;border-radius:8px;margin-bottom:14px;display:flex;align-items:center;gap:10px;font-weight:700;font-size:13px">🕊 DECEASED${m.dateOfDeath?' – Petsa: '+formatDate(m.dateOfDeath):''}</div>`:''}

            <!-- Member Header -->
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid ${m.isDeceased?'rgba(252,165,165,.5)':i===0?'rgba(200,168,75,.35)':'var(--border)'}">
              <div style="width:34px;height:34px;border-radius:50%;background:${m.isDeceased?'#9ca3af':i===0?'var(--gold)':'var(--navy)'};color:${i===0&&!m.isDeceased?'var(--navydk)':'#fff'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">${m.isDeceased?'✝':i+1}</div>
              <div style="flex:1">
                <div style="font-size:15px;font-weight:700;color:${m.isDeceased?'#6b7280':'var(--navy)'};font-family:'Source Serif 4',serif;${m.isDeceased?'text-decoration:line-through':''}">${m.lastName||'—'}, ${m.firstName||'—'} ${m.middleName||''} ${m.ext||''}</div>
                <div style="font-size:11px;color:var(--muted);margin-top:1px">${m.sex||'—'} · ${m.age||'—'} yrs old · ${m.civilStatus||'—'}</div>
              </div>
              ${i===0&&!m.isDeceased?'<span style="font-size:10px;background:var(--gold);color:var(--navydk);padding:3px 10px;border-radius:4px;font-weight:700">HOUSEHOLD HEAD</span>':''}
              ${m.isDeceased?'<span style="font-size:10px;background:#fee2e2;color:#b91c1c;padding:3px 10px;border-radius:4px;font-weight:700">🕊 DECEASED</span>':''}
            </div>

            ${section('Personal Information', grid(4,
              viewField('Last Name', m.lastName),
              viewField('First Name', m.firstName),
              viewField('Middle Name', m.middleName),
              viewField('Extension', m.ext),
              viewField('Place of Birth', m.placeOfBirth),
              viewField('Date of Birth', formatDate(m.dateOfBirth)),
              viewField('Age', m.age ? m.age+' yrs old' : ''),
              viewField('Sex', m.sex)
            ))}

            ${section('Demographics', grid(4,
              viewField('Civil Status', m.civilStatus),
              viewField('Citizenship', m.citizenship),
              viewField('Religion', m.religion),
              viewField('Birth Certificate', m.birthCert)
            ))}

            ${section('Education &amp; School Status', grid(4,
              viewField('Educational Attainment', m.education),
              viewField('School', m.school),
              viewField('School Status', m.schoolStatus),
              viewField('','')
            ))}

            ${section('Housing &amp; Lot Information', grid(4,
              viewField('House Ownership', m.houseOwnership),
              viewField('Type of House', m.houseType),
              viewField('Potable Water', m.waterSource),
              viewField('Type of Toilet', m.toiletType),
              viewField('Lot', m.lotStatus),
              viewField('',''), viewField('',''), viewField('','')
            ))}

            ${section('Employment &amp; Income', grid(4,
              viewField('Occupation', m.occupation),
              viewField('Private Employee', m.privateEmployee),
              viewField('Public Employee', m.publicEmployee),
              viewField('Monthly Income', m.income ? '&#8369;'+Number(m.income).toLocaleString() : ''),
              viewField('Other Income / Business', m.otherIncome),
              viewField('',''), viewField('',''), viewField('','')
            ))}

            ${section('Government Beneficiaries &amp; Special Categories',
              '<div style="display:flex;flex-wrap:wrap;gap:4px">'
              + viewCheck('SOCIAL PENSION',m.govScension)
              + viewCheck("4P's",m.gov4ps)
              + viewCheck("IP's",m.govIps)
              + viewCheck('MCCT',m.govMcct)
              + viewCheck('UCT',m.govUct)
              + viewCheck('Pensioner SSS',m.pensionerSSS)
              + viewCheck('Pensioner GSIS',m.pensionerGSIS)
              + viewCheck('PWD',m.isPWD)
              + viewCheck('Solo Parent (Mother)',m.isSoloMother)
              + viewCheck('Solo Parent (Father)',m.isSoloFather)
              + viewCheck('OFW',m.isOFW)
              + viewCheck('Indigenous Person (IP)',m.isIP)
              + viewCheck('Registered Voter',m.isVoter)
              + viewCheck('Boarder',m.isBoarder)
              + viewCheck('Cigarette User',m.cigarette)
              + viewCheck('Alcohol User',m.alcohol)
              + (![m.govScension,m.gov4ps,m.govIps,m.govMcct,m.govUct,m.pensionerSSS,m.pensionerGSIS,m.isPWD,m.isSoloMother,m.isSoloFather,m.isOFW,m.isIP,m.isVoter,m.isBoarder,m.cigarette,m.alcohol].some(Boolean)?'<span style="color:var(--muted);font-size:12px">None</span>':'')
              + '</div>'
            )}
          </div>
        `).join('')}
      </div>

    </div>
  `;

  // Navigate to detail page
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');
  if(memberIdx !== undefined && memberIdx > 0){
    setTimeout(()=>selectMember(memberIdx), 50);
  }
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('topbar-title').textContent = hh.id+' – Household Detail';
  document.getElementById('topbar-sub').textContent = `Brgy. ${hh.barangay||'—'} · ${hh.city||'—'}`;
  document.getElementById('topbar-actions').innerHTML=``;

}
function closeModal(){document.getElementById('hh-modal').classList.remove('open');}

// ══════════════════════════════════════════════════════════════
// EXPORT HOUSEHOLD TO EXCEL (Form A format)
// ══════════════════════════════════════════════════════════════
function exportHouseholdExcel(id){
  const hh=DB.find(h=>h.id===id);
  if(!hh){toast('Household not found.');return;}

  const wb = XLSX.utils.book_new();
  const ws_data = [];

  // Header block
  ws_data.push(['RECORD OF BARANGAY INHABITANTS BY HOUSEHOLD']);
  ws_data.push(['FORM A']);
  ws_data.push([]);
  ws_data.push(['REGION:', hh.region||'', '', 'PROVINCE:', hh.province||'']);
  ws_data.push(['CITY/MUNICIPALITY:', hh.city||'', '', 'BARANGAY:', hh.barangay||'']);
  ws_data.push(['HOUSEHOLD NO.:', hh.hhNo||'', '', 'PUROK/ADDRESS:', hh.address||'']);
  ws_data.push(['LOT OWNER/RENTER:', hh.lotOwner||'', '', 'LOT SITE (CBRDP):', hh.lotSite||'']);
  ws_data.push([]);

  // Column headers matching Form A
  const cols = [
    'NO.','LAST NAME','FIRST NAME','MIDDLE NAME','EXT',
    'PLACE OF BIRTH','DATE OF BIRTH','AGE','SEX','CIVIL STATUS',
    'EDUCATIONAL ATTAINMENT','SCHOOL','SCHOOL STATUS','BIRTH CERTIFICATE',
    'HOUSE OWNERSHIP','TYPE OF HOUSE','POTABLE WATER','TYPE OF TOILET','LOT',
    'OCCUPATION','PRIVATE EMPLOYEE','PUBLIC EMPLOYEE','INCOME','OTHER INCOME/BUSINESS',
    'CITIZENSHIP','RELIGION',
    'PENSIONER SSS','PENSIONER GSIS','PWD','SOLO PARENT (MOTHER)','SOLO PARENT (FATHER)',
    'OFW','IP (INDIGENOUS PEOPLE)','REGISTERED VOTER','BOARDER',
    'CIGARETTE USER','ALCOHOL USER',
    'GOV. BENEFICIARY: SOCIAL PENSION',"GOV. BENEFICIARY: 4P'S","GOV. BENEFICIARY: IP'S",
    'GOV. BENEFICIARY: MCCT','GOV. BENEFICIARY: UCT',
  ];
  ws_data.push(cols);

  hh.members.forEach((m,i)=>{
    ws_data.push([
      i+1,
      m.lastName, m.firstName, m.middleName||'', m.ext||'',
      m.placeOfBirth||'', m.dateOfBirth||'', m.age||'', m.sex||'', m.civilStatus||'',
      m.education||'', m.school||'', m.schoolStatus||'', m.birthCert||'',
      m.houseOwnership||'', m.houseType||'', m.waterSource||'', m.toiletType||'', m.lotStatus||'',
      m.occupation||'', m.privateEmployee||'', m.publicEmployee||'',
      m.income?Number(m.income):'', m.otherIncome||'',
      m.citizenship||'', m.religion||'',
      m.pensionerSSS?'✓':'', m.pensionerGSIS?'✓':'',
      m.isPWD?'✓':'',
      m.isSoloMother?'✓':'', m.isSoloFather?'✓':'',
      m.isOFW?'✓':'',
      m.isIP?'✓':'',
      m.isVoter?'✓':'',
      m.isBoarder?'✓':'',
      m.cigarette?'✓':'',
      m.alcohol?'✓':'',
      m.govScension?'✓':'', m.gov4ps?'✓':'', m.govIps?'✓':'',
      m.govMcct?'✓':'', m.govUct?'✓':'',
    ]);
  });

  ws_data.push([]);
  ws_data.push([`Total Members: ${hh.members.length}`]);
  ws_data.push([]);
  ws_data.push(['Prepared by:', '', '', '', 'Certified Correct:', '', '', '', 'Validated by:']);
  ws_data.push([]);
  ws_data.push(['________________________________', '', '', '', '________________________________', '', '', '', '________________________________']);
  ws_data.push(['Name of Household Head/Member', '', '', '', 'Barangay Secretary', '', '', '', 'Punong Barangay']);
  ws_data.push(['(Signature over Printed Name)', '', '', '', '(Signature over Printed Name)', '', '', '', '(Signature over Printed Name)']);

  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  // Column widths
  ws['!cols'] = [
    {wch:5},{wch:18},{wch:16},{wch:16},{wch:6},
    {wch:18},{wch:13},{wch:5},{wch:7},{wch:11},
    {wch:16},{wch:16},{wch:12},{wch:12},{wch:10},
    {wch:10},{wch:10},{wch:6},{wch:14},{wch:14},
    {wch:6},{wch:8},{wch:10},{wch:8},
    {wch:10},{wch:10},{wch:16},{wch:14},{wch:14},
  ];

  // Merge header title row
  ws['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:28}},
    {s:{r:1,c:0},e:{r:1,c:28}},
  ];

  // Style header rows (basic)
  styleCell(ws,'A1',{bold:true,sz:14,alignment:{horizontal:'center'}});
  styleCell(ws,'A2',{bold:true,sz:11,alignment:{horizontal:'center'}});

  // Style the column header row (row index 8 = ws_data[8])
  const headerRow = 8;
  cols.forEach((_,ci)=>{
    const cellRef = XLSX.utils.encode_cell({r:headerRow,c:ci});
    styleCell(ws,cellRef,{bold:true,fill:{fgColor:{rgb:'0D2B5E'}},color:{rgb:'FFFFFF'},sz:10,alignment:{horizontal:'center',wrapText:true}});
  });

  XLSX.utils.book_append_sheet(wb, ws, 'Form A - Household');
  XLSX.writeFile(wb, `RBI_FormA_${hh.id}_${hh.barangay||'Barangay'}.xlsx`);
  toast('✅ Excel exported: ' + hh.id);
}

function styleCell(ws, ref, style){
  if(!ws[ref]) ws[ref]={t:'s',v:''};
  ws[ref].s = {
    font: {bold: style.bold, sz: style.sz, color: style.color},
    fill: style.fill ? {patternType:'solid',...style.fill} : undefined,
    alignment: style.alignment,
  };
}

// ══════════════════════════════════════════════════════════════
// SUMMARY REPORT
// ══════════════════════════════════════════════════════════════
function renderReport(){
  const allMembers=DB.flatMap(hh=>hh.members);
  const total=allMembers.length;
  const countM=fn=>allMembers.filter(x=>x.sex==='Male'&&fn(x)).length;
  const countF=fn=>allMembers.filter(x=>x.sex==='Female'&&fn(x)).length;
  const totalM=countM(()=>true), totalF=countF(()=>true);
  const semester=document.getElementById('rpt-semester').value;
  const year=document.getElementById('rpt-year').value;

  const ageBrackets=[
    {lbl:'Under 5 years old',mn:0,mx:4},
    {lbl:'5-9 years old',mn:5,mx:9},
    {lbl:'10-14 years old',mn:10,mx:14},
    {lbl:'15-19 years old',mn:15,mx:19},
    {lbl:'20-24 years old',mn:20,mx:24},
    {lbl:'25-29 years old',mn:25,mx:29},
    {lbl:'30-34 years old',mn:30,mx:34},
    {lbl:'35-39 years old',mn:35,mx:39},
    {lbl:'40-44 years old',mn:40,mx:44},
    {lbl:'45-49 years old',mn:45,mx:49},
    {lbl:'50-54 years old',mn:50,mx:54},
    {lbl:'55-59 years old',mn:55,mx:59},
    {lbl:'60-64 years old',mn:60,mx:64},
    {lbl:'65-69 years old',mn:65,mx:69},
    {lbl:'70-74 years old',mn:70,mx:74},
    {lbl:'75-79 years old',mn:75,mx:79},
    {lbl:'80 years old and over',mn:80,mx:999},
  ];

  const tdNum=(v)=>`<td style="text-align:center;border:1px solid #ccc;padding:4px 8px">${v||''}</td>`;
  const tdLbl=(v,indent)=>`<td style="border:1px solid #ccc;padding:4px 8px;${indent?'padding-left:28px':''}">${v}</td>`;
  const tdLblBold=(v)=>`<td style="border:1px solid #ccc;padding:4px 8px;font-weight:700;background:#deeee3">${v}</td>`;
  const tdFull=(v)=>`<td colspan="5" style="border:1px solid #ccc;padding:4px 8px;font-weight:700;font-style:italic;background:#deeee3">${v}</td>`;

  const ageRows=ageBrackets.map(b=>{
    const m=countM(x=>+x.age>=b.mn&&+x.age<=b.mx);
    const f=countF(x=>+x.age>=b.mn&&+x.age<=b.mx);
    return `<tr>${tdLbl(b.lbl,true)}${tdNum(m)}${tdNum(f)}${tdNum(m+f)}${tdNum('')}</tr>`;
  }).join('');

  const sectors=[
    {lbl:'Labor Force',fn:x=>x.occupation&&x.occupation.trim()!=''},
    {lbl:'Unemployed',fn:x=>!x.occupation||x.occupation.trim()==''},
    {lbl:'Out of School Children  (OSC)\n(0-5 years old)',fn:x=>{const a=+x.age;return a>=0&&a<=5&&x.schoolStatus!=='In School';}},
    {lbl:'Out of School Youth  (OSY)\n(15-24 years old)',fn:x=>{const a=+x.age;return a>=15&&a<=24&&(!x.occupation||x.occupation.trim()==='')&&x.schoolStatus!=='In School';}},
    {lbl:'Person with Disabilities (PWDs)',fn:x=>x.isPWD},
    {lbl:'Overseas Filipino Workers (OFWs)',fn:x=>x.isOFW},
    {lbl:'Solo Parents',fn:x=>x.isSoloParent},
    {lbl:'Indigenous Peoples (IPs)',fn:x=>x.isIP},
  ];

  const sectorRows=sectors.map(s=>{
    const m=countM(s.fn), f=countF(s.fn);
    return `<tr>${tdLbl(s.lbl.replace('\n','<br>'),false)}${tdNum(m)}${tdNum(f)}${tdNum(m+f)}${tdNum('')}</tr>`;
  }).join('');

  const singleM=countM(x=>x.civilStatus==='Single'),singleF=countF(x=>x.civilStatus==='Single');
  const marriedM=countM(x=>x.civilStatus==='Married'),marriedF=countF(x=>x.civilStatus==='Married');
  const filM=countM(x=>x.citizenship==='Filipino'),filF=countF(x=>x.citizenship==='Filipino');
  const forM=countM(x=>x.citizenship==='Foreigner'),forF=countF(x=>x.citizenship==='Foreigner');

  const tblStyle='width:100%;border-collapse:collapse;font-size:12.5px;font-family:Calibri,sans-serif';
  const thStyle='border:1px solid #ccc;padding:6px 8px;background:#c5e0b3;text-align:center;font-weight:700';

  document.getElementById('report-body').innerHTML=`
    <div style="font-family:Calibri,Arial,sans-serif;font-size:13px;max-width:860px;margin:0 auto;padding:16px">
      <!-- Title block -->
      <div style="display:grid;grid-template-columns:auto 1fr;gap:0;border:1px solid #ccc;border-bottom:none">
        <div style="padding:6px 10px;font-weight:700;border-right:1px solid #ccc;font-size:12px">RBI FORM C</div>
        <div style="text-align:center;padding:4px">
          <div style="font-weight:700;font-size:13px">MONITORING REPORT</div>
          <div style="font-size:12px">for <em>${semester}</em> of CY <em>${year}</em></div>
        </div>
      </div>
      <!-- Meta info table -->
      <table style="${tblStyle}">
        <tr><td style="padding:3px 8px;border:1px solid #ccc;width:30%">REGION :</td><td style="padding:3px 8px;border:1px solid #ccc">XIII</td></tr>
        <tr><td style="padding:3px 8px;border:1px solid #ccc">PROVINCE:</td><td style="padding:3px 8px;border:1px solid #ccc">Agusan del Norte</td></tr>
        <tr><td style="padding:3px 8px;border:1px solid #ccc">CITY/MUNICIPALITY:</td><td style="padding:3px 8px;border:1px solid #ccc">Butuan City</td></tr>
        <tr><td style="padding:3px 8px;border:1px solid #ccc">BARANGAY:</td><td style="padding:3px 8px;border:1px solid #ccc">Pangabugan</td></tr>
        <tr><td style="padding:3px 8px;border:1px solid #ccc">Total No. of Barangay Inhabitants:</td><td style="padding:3px 8px;border:1px solid #ccc">${total}</td></tr>
        <tr><td style="padding:3px 8px;border:1px solid #ccc">Total No. of Households:</td><td style="padding:3px 8px;border:1px solid #ccc">${DB.length}</td></tr>
        <tr><td style="padding:3px 8px;border:1px solid #ccc">Total No. of Families:</td><td style="padding:3px 8px;border:1px solid #ccc">${DB.length}</td></tr>
      </table>
      <!-- Main table -->
      <table style="${tblStyle};margin-top:12px">
        <thead>
          <tr>
            <th style="${thStyle};width:52%">INDICATORS</th>
            <th style="${thStyle};width:12%">MALE</th>
            <th style="${thStyle};width:12%">FEMALE</th>
            <th style="${thStyle};width:12%">TOTAL</th>
            <th style="${thStyle};width:12%">REMARKS</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="5" style="border:1px solid #ccc;padding:4px 8px;font-weight:700;font-style:italic;background:#deeee3">Population by Age Bracket:</td></tr>
          ${ageRows}
          <tr><td colspan="5" style="border:1px solid #ccc;padding:4px 8px;font-weight:700;font-style:italic;background:#deeee3">Population by Sector:</td></tr>
          ${sectorRows}
          <tr>${tdLbl('Civil Status : Single',false)}${tdNum(singleM)}${tdNum(singleF)}${tdNum(singleM+singleF)}${tdNum('')}</tr>
          <tr>${tdLbl('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: Married',false)}${tdNum(marriedM)}${tdNum(marriedF)}${tdNum(marriedM+marriedF)}${tdNum('')}</tr>
          <tr>${tdLbl('Citizenship : Filipino',false)}${tdNum(filM)}${tdNum(filF)}${tdNum(filM+filF)}${tdNum('')}</tr>
          <tr>${tdLbl('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: Foreigner',false)}${tdNum(forM)}${tdNum(forF)}${tdNum(forM+forF)}${tdNum('')}</tr>
        </tbody>
      </table>
      <!-- Signatories -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px">
        <div>
          <div style="font-weight:700;font-size:12px">Prepared by:</div>
          <div style="border-top:1px solid #000;margin-top:32px;padding-top:4px">
            <div style="font-weight:700;font-size:12px">Barangay Secretary</div>
            <div style="font-size:11px">(Signature over Printed Name)</div>
          </div>
        </div>
        <div>
          <div style="font-weight:700;font-size:12px">Submitted by:</div>
          <div style="border-top:1px solid #000;margin-top:32px;padding-top:4px">
            <div style="font-weight:700;font-size:12px">Punong Barangay</div>
            <div style="font-size:11px">(Signature over Printed Name)</div>
          </div>
        </div>
      </div>
      <div style="margin-top:18px">
        <div style="font-weight:700;font-size:12px">Date Accomplished:</div>
        <div style="border-top:1px solid #000;width:180px;margin-top:18px"></div>
      </div>
      <div style="margin-top:18px;font-size:11px;font-style:italic">
        Note: This RBI Form C (Semestral Monitoring Report) is to be submitted to DILG C/MLGOO as a reference for encoding to BIS-BPS.
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// EXPORT SUMMARY REPORT TO EXCEL (mirrors uploaded RBI Form C template)
// ══════════════════════════════════════════════════════════════
function exportSummaryExcel(){
  const allMembers=DB.flatMap(hh=>hh.members);
  const total=allMembers.length;
  const countM=fn=>allMembers.filter(x=>x.sex==='Male'&&fn(x)).length;
  const countF=fn=>allMembers.filter(x=>x.sex==='Female'&&fn(x)).length;
  const semester=document.getElementById('rpt-semester').value;
  const year=document.getElementById('rpt-year').value;

  const ageBrackets=[
    {lbl:'    Under 5 years old',mn:0,mx:4},
    {lbl:'5-9 years old',mn:5,mx:9},
    {lbl:'10-14 years old',mn:10,mx:14},
    {lbl:'15-19 years old',mn:15,mx:19},
    {lbl:'20-24 years old',mn:20,mx:24},
    {lbl:'25-29 years old',mn:25,mx:29},
    {lbl:'30-34 years old',mn:30,mx:34},
    {lbl:'35-39 years old',mn:35,mx:39},
    {lbl:'40-44 years old',mn:40,mx:44},
    {lbl:'45-49 years old',mn:45,mx:49},
    {lbl:'50-54 years old',mn:50,mx:54},
    {lbl:'55-59 years old',mn:55,mx:59},
    {lbl:'60-64 years old',mn:60,mx:64},
    {lbl:'65-69 years old',mn:65,mx:69},
    {lbl:'70-74 years old',mn:70,mx:74},
    {lbl:'75-79 years old',mn:75,mx:79},
    {lbl:'80 years old and over',mn:80,mx:999},
  ];

  const sectors=[
    {lbl:'Labor Force',fn:x=>x.occupation&&x.occupation.trim()!=''},
    {lbl:'Unemployed',fn:x=>!x.occupation||x.occupation.trim()==''},
    {lbl:'Out of School Children  (OSC)                            (0-5 years old)',fn:x=>{const a=+x.age;return a>=0&&a<=5&&x.schoolStatus!=='In School';}},
    {lbl:'Out of School Youth  (OSY)                             (15-24 years old)',fn:x=>{const a=+x.age;return a>=15&&a<=24&&(!x.occupation||x.occupation.trim()==='')&&x.schoolStatus!=='In School';}},
    {lbl:'Person with Disabilities (PWDs)',fn:x=>x.isPWD},
    {lbl:'Overseas Filipino Workers (OFWs)',fn:x=>x.isOFW},
    {lbl:'Solo Parents',fn:x=>x.isSoloParent},
    {lbl:'Indigenous Peoples (IPs)',fn:x=>x.isIP},
  ];

  const singleM=countM(x=>x.civilStatus==='Single'),singleF=countF(x=>x.civilStatus==='Single');
  const marriedM=countM(x=>x.civilStatus==='Married'),marriedF=countF(x=>x.civilStatus==='Married');
  const filM=countM(x=>x.citizenship==='Filipino'),filF=countF(x=>x.citizenship==='Filipino');
  const forM=countM(x=>x.citizenship==='Foreigner'),forF=countF(x=>x.citizenship==='Foreigner');

  const wb = XLSX.utils.book_new();
  const ws = {};

  const thin = {style:'thin'};
  const border = {top:thin,bottom:thin,left:thin,right:thin};

  const STY = {
    hdr:  { font:{bold:true,name:'Calibri',sz:11}, fill:{patternType:'solid',fgColor:{rgb:'C5E0B3'}}, alignment:{horizontal:'center',vertical:'center',wrapText:true}, border },
    sect: { font:{bold:true,italic:true,name:'Calibri',sz:11}, fill:{patternType:'solid',fgColor:{rgb:'DEEEE3'}}, alignment:{horizontal:'left',vertical:'center',wrapText:true}, border },
    lbl:  { font:{name:'Calibri',sz:11}, alignment:{horizontal:'center',vertical:'center',wrapText:true}, border },
    num:  { font:{name:'Calibri',sz:11}, alignment:{horizontal:'center',vertical:'center'}, border },
    meta: { font:{name:'Calibri',sz:11}, alignment:{horizontal:'left',vertical:'center'}, border },
    bold: { font:{bold:true,name:'Calibri',sz:11}, alignment:{horizontal:'left',vertical:'center'} },
    norm: { font:{name:'Calibri',sz:11}, alignment:{horizontal:'left',vertical:'center'} },
    titl: { font:{bold:true,name:'Calibri',sz:11}, alignment:{horizontal:'left',vertical:'center'} },
    titl2:{ font:{bold:true,name:'Calibri',sz:11}, alignment:{horizontal:'center',vertical:'center'} },
    itl:  { font:{name:'Calibri',sz:11}, alignment:{horizontal:'center',vertical:'center'} },
    note: { font:{italic:true,name:'Calibri',sz:10}, alignment:{horizontal:'left',wrapText:true} },
  };

  ws['!merges'] = [];
  const merge = (r1,c1,r2,c2)=>ws['!merges'].push({s:{r:r1,c:c1},e:{r:r2,c:c2}});

  const sc = (row,col,val,sty)=>{
    const ref = XLSX.utils.encode_cell({r:row,c:col});
    ws[ref] = {v:val, t: typeof val==='number'?'n':'s'};
    if(sty) ws[ref].s = sty;
  };

  // Row 1 (r=0): A1 = "RBI FORM C" (bold, left)
  sc(0,0,'RBI FORM C', STY.titl);

  // Row 2 (r=1): A2:E2 merged = "MONITORING REPORT" (bold, centered)
  sc(1,0,'MONITORING REPORT', STY.titl2); merge(1,0,1,4);

  // Row 3 (r=2): A3:E3 merged = "for ___ Semester of CY ____" (italic, centered)
  sc(2,0,`for ${semester} Semester of CY ${year}`, STY.itl); merge(2,0,2,4);

  // Row 4 (r=3): blank spacer

  // Rows 5-8 (r=4-7): Region/Province/City/Barangay — label in A, value merged B:D
  const metaRows=[
    ['REGION :      ','XIII'],
    ['PROVINCE:   ','Agusan del Norte'],
    ['CITY/MUNICIPALITY:  ','Butuan City'],
    ['BARANGAY:  ','Pangabugan'],
  ];
  metaRows.forEach(([lbl,val],i)=>{
    sc(4+i,0,lbl,STY.meta);
    sc(4+i,1,val,STY.meta); merge(4+i,1,4+i,3);
  });

  // Row 9 (r=8): blank spacer

  // Rows 10-12 (r=9-11): Totals — label A, value merged B:D
  sc(9,0,'Total No. of Barangay Inhabitants:',STY.meta); sc(9,1,total,STY.num); merge(9,1,9,3);
  sc(10,0,'Total No. of Households:',STY.meta); sc(10,1,DB.length,STY.num); merge(10,1,10,3);
  sc(11,0,'Total No. of Families:',STY.meta); sc(11,1,DB.length,STY.num); merge(11,1,11,3);

  // Row 13 (r=12): blank spacer

  // Row 14 (r=13): Column headers — INDICATORS | MALE | FEMALE | TOTAL | REMARKS
  sc(13,0,'INDICATORS',STY.hdr);
  sc(13,1,'MALE',STY.hdr);
  sc(13,2,'FEMALE',STY.hdr);
  sc(13,3,'TOTAL',STY.hdr);
  sc(13,4,'REMARKS',STY.hdr);

  // Row 15 (r=14): "Population by Age Bracket:" section header, merged A:E
  sc(14,0,'Population by Age Bracket:',STY.sect); merge(14,0,14,4);

  // Rows 16-32 (r=15-31): Age bracket data rows
  ageBrackets.forEach((b,i)=>{
    const m=countM(x=>+x.age>=b.mn&&+x.age<=b.mx);
    const f=countF(x=>+x.age>=b.mn&&+x.age<=b.mx);
    sc(15+i,0,b.lbl,STY.lbl);
    sc(15+i,1,m,STY.num);
    sc(15+i,2,f,STY.num);
    sc(15+i,3,m+f,STY.num);
    sc(15+i,4,'',STY.num);
  });

  // Row 33 (r=32): "Population by Sector:" section header, merged A:E
  sc(32,0,'Population by Sector:',STY.sect); merge(32,0,32,4);

  // Rows 34-41 (r=33-40): Sector data rows
  sectors.forEach((s,i)=>{
    const m=countM(s.fn), f=countF(s.fn);
    sc(33+i,0,s.lbl,STY.lbl);
    sc(33+i,1,m,STY.num);
    sc(33+i,2,f,STY.num);
    sc(33+i,3,m+f,STY.num);
    sc(33+i,4,'',STY.num);
  });

  // Rows 42-45 (r=41-44): Civil Status & Citizenship
  let nr = 33 + sectors.length;
  sc(nr,0,'Civil Status : Single',STY.lbl); sc(nr,1,singleM,STY.num); sc(nr,2,singleF,STY.num); sc(nr,3,singleM+singleF,STY.num); sc(nr,4,'',STY.num); nr++;
  sc(nr,0,'                       : Married',STY.lbl); sc(nr,1,marriedM,STY.num); sc(nr,2,marriedF,STY.num); sc(nr,3,marriedM+marriedF,STY.num); sc(nr,4,'',STY.num); nr++;
  sc(nr,0,'Citizenship : Filipino',STY.lbl); sc(nr,1,filM,STY.num); sc(nr,2,filF,STY.num); sc(nr,3,filM+filF,STY.num); sc(nr,4,'',STY.num); nr++;
  sc(nr,0,'                        : Foreigner',STY.lbl); sc(nr,1,forM,STY.num); sc(nr,2,forF,STY.num); sc(nr,3,forM+forF,STY.num); sc(nr,4,'',STY.num); nr++;

  nr++; // Row 46 blank spacer

  // Row 47: Prepared by / Submitted by
  sc(nr,0,'Prepared by:',STY.bold); sc(nr,4,'Submitted by:',STY.bold); nr++;

  nr++; // Row 48 blank (signature space)

  // Row 49: signature lines
  sc(nr,0,'_____________________',STY.norm); sc(nr,4,'________________________',STY.norm); nr++;
  // Row 50: role labels
  sc(nr,0,'Barangay Secretary',STY.bold); sc(nr,4,'Punong Barangay',STY.bold); nr++;
  // Row 51: "(Signature over Printed Name)"
  sc(nr,0,'(Signature over Printed Name)',STY.norm); sc(nr,4,'(Signature over Printed Name)',STY.norm); nr++;

  nr++; // Row 52 blank
  // Row 53
  sc(nr,0,'Date Accomplished:',STY.bold); nr++;
  // Row 54
  sc(nr,0,'____________________',STY.norm); nr++;

  nr++; // Row 55 blank

  // Row 56: Note
  sc(nr,0,'Note: This RBI Form C (Semestral Monitoring Report) is to be submitted to DILG C/MLGOO as a reference for encoding to BIS-BPS.',STY.note);
  merge(nr,0,nr,4);

  // Column widths exactly matching the template
  ws['!cols'] = [
    {wch:29.71}, // A
    {wch:10.57}, // B
    {wch:10.29}, // C
    {wch:14.0},  // D
    {wch:32.71}, // E
  ];

  // Row heights exactly matching the template
  ws['!rows'] = [
    {hpx:14.4},  // 1
    {hpx:14.4},  // 2
    {hpx:14.4},  // 3
    {hpx:4.5},   // 4
    {hpx:14.25}, // 5
    {hpx:14.4},  // 6
    {hpx:14.4},  // 7
    {hpx:14.4},  // 8
    {hpx:3.0},   // 9
    {hpx:14.4},  // 10
    {hpx:14.4},  // 11
    {hpx:14.4},  // 12
    {hpx:6.0},   // 13
    {hpx:21.75}, // 14
    {hpx:16.5},  // 15
    {hpx:21.0},  // 16
    {hpx:21.0},  // 17
    {hpx:21.0},  // 18
    {hpx:21.0},  // 19
    {hpx:21.0},  // 20
    {hpx:21.0},  // 21
    {hpx:21.0},  // 22
    {hpx:21.0},  // 23
    {hpx:21.0},  // 24
    {hpx:21.0},  // 25
    {hpx:21.0},  // 26
    {hpx:21.0},  // 27
    {hpx:21.0},  // 28
    {hpx:21.0},  // 29
    {hpx:21.0},  // 30
    {hpx:21.0},  // 31
    {hpx:21.0},  // 32
    {hpx:18.0},  // 33
    {hpx:27.0},  // 34
    {hpx:23.25}, // 35
    {hpx:33.0},  // 36
    {hpx:15.75}, // 37
    {hpx:21.0},  // 38
    {hpx:30.75}, // 39
    {hpx:21.0},  // 40
    {hpx:21.75}, // 41
    {hpx:21.75}, // 42
    {hpx:21.75}, // 43
    {hpx:21.75}, // 44
    {hpx:21.75}, // 45
    {hpx:6.0},   // 46
    {hpx:15.75}, // 47
    {hpx:15.75}, // 48
    {hpx:15.75}, // 49
    {hpx:15.75}, // 50
    {hpx:15.75}, // 51
    {hpx:15.75}, // 52
    {hpx:15.75}, // 53
    {hpx:15.75}, // 54
    {hpx:15.75}, // 55
    {hpx:15.75}, // 56
  ];

  ws['!ref'] = XLSX.utils.encode_range({s:{r:0,c:0},e:{r:nr,c:4}});

  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `RBI_FormC_Pangabugan_${semester.replace(' ','')}_${year}.xlsx`, {cellStyles: true});
  toast('✅ RBI Form C exported!');
}

// ══════════════════════════════════════════════════════════════
// IMPORT EXCEL (RBI Form A style — reads rows as members)
// Expected columns (flexible, case-insensitive header matching):
//  HH No | Purok/Address | Last Name | First Name | Middle Name | Ext |
//  Date of Birth | Age | Sex | Civil Status | Citizenship | Religion |
//  Education | Occupation | Income | PWD | OFW | Solo Parent | IP |
//  Place of Birth | School Status | Birth Cert | House Ownership |
//  House Type | Water Source | Toilet | Lot Status
// ══════════════════════════════════════════════════════════════
function triggerImportExcel(){
  document.getElementById('excel-import-input').value='';
  document.getElementById('excel-import-input').click();
}

// Store workbook globally while waiting for purok selection
let _pendingWB = null;

function importExcelFile(input){
  const file = input.files[0];
  if(!file){ return; }
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      _pendingWB = XLSX.read(data, {type:'array', cellDates:true});
      const sheetCount = _pendingWB.SheetNames.length;
      if(!sheetCount){ toast('❌ No sheets found in the Excel file!'); return; }
      // Show purok picker modal
      document.getElementById('purok-sheet-count').textContent = sheetCount;
      document.getElementById('purok-modal').classList.add('open');
      document.getElementById('purok-picker').value = 'ALMASIGA';
      document.getElementById('purok-custom-group').style.display = 'none';
      document.getElementById('purok-custom').value = '';
    } catch(err){
      console.error(err);
      toast('❌ Error reading Excel file. Please check the format.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function closePurokModal(){
  document.getElementById('purok-modal').classList.remove('open');
  _pendingWB = null;
}


function confirmImport(){
  if(!_pendingWB){ closePurokModal(); return; }
  const wb = _pendingWB;   // save reference BEFORE closePurokModal nullifies it
  const selectedPurok = document.getElementById('purok-picker').value;
  closePurokModal();        // this sets _pendingWB = null, but wb still has the ref
  processAllSheets(wb, selectedPurok);
}

function processAllSheets(wb, selectedPurok){
  // Normalize header key
  const norm = s => String(s).toLowerCase().replace(/[\s_\-\/\.]+/g,'');

  // Filipino + English column aliases (updated to match exact Excel headers)
  const ALIASES = {
    'last name':    ['apelyido','apellido','family name','surname','lastname','last name'],
    'first name':   ['pangalan','unang pangalan','given name','firstname','first name','givenname'],
    'middle name':  ['gitnang pangalan','middle name','middlename','maiden'],
    'ext':          ['ext','extensions','suffix','extension','sr','jr'],
    'place of birth':['lugar ng kapanganakan','lugar kapanganakan','place of birth','placeofbirth','birthplace','birth place'],
    'date of birth':['petsa ng kapanganakan','kapanganakan','date of birth','dob','birthdate','birth date','petsa kapanganakan'],
    'age':          ['edad','age','gulang'],
    'sex':          ['kasarian','sex','gender'],
    'civil status': ['katayuang sibil','civil status','civilstatus','marital status','marital'],
    'citizenship':  ['pagkamamamayan','citizenship','nationality'],
    'religion':     ['relihiyon','religion','religious affiliation'],
    'education':    ['edukasyon','educational attainment','educational attianment','educationalattianment','education','educ','attainment'],
    'school':       ['paaralan','school','school name'],
    'in school':    ['in school','inschool','nasa paaralan'],
    'out of school':['out of school','outofschool','out of school youth','out of school children','labas ng paaralan'],
    'occupation':   ['hanapbuhay','trabaho','occupation','work','job','employment'],
    'student':      ['student','estudyante'],
    'income':       ['kita','income','monthly income','monthly salary'],
    'pwd':          ['pwd','may kapansanan','disability','person with disability'],
    'ofw':          ['ofw','overseas'],
    'solo parent':  ['solo parent','nag iisang magulang','soloparent'],
    'solo mother':  ['solo mother','solo parent mother','nag iisang ina'],
    'solo father':  ['solo father','solo parent father','nag iisang ama'],
    'ip':           ['ip','indigenous','lumad','katutubong mamamayan'],
    'voter':        ['botante','voter','registered voter'],
    'house ownership':['pagmamay ari ng bahay','house ownership','houseownership','house'],
    'house type':   ['uri ng bahay','house type','housetype','housing type','type of house'],
    'water source': ['pinagkukunan ng tubig','water source','watersource','water supply','potable water'],
    'toilet type':  ['uri ng palikuran','toilet','toilet type','toilettype','sanitation','type of toilet'],
    'lot status':   ['katayuan ng lote','lot status','lotstatus','lot'],
    'govt benefits':['government benefeciaries','government beneficiaries','govt benefits','govtbenefits','beneficiaries'],
    'pensioner':    ['pensioner','pension'],
    '4ps':          ['4ps','4p','pantawid','4ps beneficiary'],
    'sss':          ['sss','sss pensioner','sss member'],
    'gsis':         ['gsis','gsis pensioner'],
    'boarder':      ['boarder','nakatira'],
    'cigarette':    ['sigarilyo','cigarette','cigaratte','cigarette user','cigaratte user','smoker','tobacco'],
    'alcohol':      ['alak','alcohol','alcohol user','drinker','liquor'],
    'other income': ['iba pang kita','other income','otherincome','other source','other source of income','other source of income/business'],
    'birth cert':   ['sertipiko ng kapanganakan','birth cert','birthcert','birth certificate'],
    'private employee':['private employee','private employer','private company'],
    'public employee':['public employee','government employee'],
    'scension':     ['scension','senior citizen pension','social pension','socialpension'],
    'ips govt':     ['ips govt','ips program'],
    'mcct':         ['mcct'],
    'uct':          ['uct'],
    'unemployed':   ['unemployed','walang trabaho'],
    'pregnant':     ['pregnant','buntis'],
  };

  // Build a reverse lookup: normalized alias → canonical key
  const aliasMap = {};
  for(const [canon, aliases] of Object.entries(ALIASES)){
    for(const a of aliases){ aliasMap[norm(a)] = canon; }
  }

  function col(row, ...keys){
    // First try direct alias-based lookup
    for(const k of Object.keys(row)){
      const nk = norm(k);
      const canon = aliasMap[nk] || (()=>{
        // partial match fallback
        for(const [alias, c] of Object.entries(aliasMap)){
          if(nk.includes(alias)||alias.includes(nk)) return c;
        }
        return null;
      })();
      if(canon && keys.some(want => norm(want)===norm(canon)||norm(canon).includes(norm(want))||norm(want).includes(norm(canon)))){
        return String(row[k]||'').trim();
      }
    }
    // Fallback: original substring match (handles columns not in alias list)
    for(const k of Object.keys(row)){
      const nk = norm(k);
      for(const want of keys){
        if(nk.includes(norm(want))||norm(want).includes(nk)) return String(row[k]||'').trim();
      }
    }
    return '';
  }
  function colBool(row, ...keys){
    const v = col(row,...keys).toLowerCase().trim();
    return v==='yes'||v==='true'||v==='1'||v==='x'||v==='✓'||v==='oo'||v==='/'||v==='\\'||v==='yes '||v==='checked'||v==='yes'||v==='✔';
  }

  // ── Smart header row detection ──
  // Scan first N rows; use the one with the most recognizable headers
  function findHeaderRowIndex(ws){
    const range = XLSX.utils.decode_range(ws['!ref']||'A1:A1');
    const maxScan = Math.min(10, range.e.r + 1);
    let bestRow = 0, bestScore = 0;
    for(let r = 0; r < maxScan; r++){
      let score = 0;
      for(let c = range.s.c; c <= range.e.c; c++){
        const cellAddr = XLSX.utils.encode_cell({r, c});
        const cell = ws[cellAddr];
        if(!cell || cell.v == null) continue;
        const nv = norm(String(cell.v));
        if(aliasMap[nv]) score += 2;
        else {
          for(const alias of Object.keys(aliasMap)){
            if(nv.includes(alias)||alias.includes(nv)){ score += 1; break; }
          }
        }
      }
      if(score > bestScore){ bestScore = score; bestRow = r; }
    }
    return bestRow;
  }

  // ── Get raw cell value from sheet ──
  function cellVal(ws, r, c){
    const cell = ws[XLSX.utils.encode_cell({r,c})];
    if(!cell || cell.v == null) return '';
    return String(cell.v).trim();
  }

  // ── LAYOUT A: Tabular (headers in one row, each subsequent row = one member) ──
  function parseTabular(ws){
    if(!ws['!ref']) return [];
    const headerRowIdx = findHeaderRowIndex(ws);
    const range = XLSX.utils.decode_range(ws['!ref']);
    range.s.r = headerRowIdx;
    const wsCopy = Object.assign({}, ws, {'!ref': XLSX.utils.encode_range(range)});
    const rows = XLSX.utils.sheet_to_json(wsCopy, {defval:''});
    return rows.filter(r => Object.values(r).some(v => String(v).trim() !== ''));
  }

  // ── LAYOUT B: Vertical/Form-style (col A = label, col B+ = member values) ──
  // e.g.:  Last Name | Juan | Maria | Pedro
  //        First Name| Dela | Cruz  | Santos
  function parseVertical(ws){
    if(!ws['!ref']) return [];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const numCols = range.e.c - range.s.c + 1;
    if(numCols < 2) return [];
    const memberCount = numCols - 1;
    const members = Array.from({length: memberCount}, () => ({}));
    for(let r = range.s.r; r <= range.e.r; r++){
      const label = cellVal(ws, r, range.s.c);
      if(!label) continue;
      for(let m = 0; m < memberCount; m++){
        const val = cellVal(ws, r, range.s.c + 1 + m);
        members[m][label] = val;
      }
    }
    return members.filter(m => Object.values(m).some(v => v !== ''));
  }

  // ── LAYOUT C: Stacked blocks (repeated label:value blocks per member, blank row separator) ──
  function parseStacked(ws){
    if(!ws['!ref']) return [];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const members = [];
    let current = {}, hasData = false;
    for(let r = range.s.r; r <= range.e.r; r++){
      const label = cellVal(ws, r, range.s.c);
      const val   = cellVal(ws, r, range.s.c + 1);
      if(!label && !val){
        if(hasData){ members.push(current); current = {}; hasData = false; }
        continue;
      }
      if(label){ current[label] = val; hasData = true; }
    }
    if(hasData) members.push(current);
    return members;
  }

  // ── Score how well-recognized the field labels are ──
  function scoreRows(rows){
    if(!rows.length) return 0;
    let score = 0;
    for(const k of Object.keys(rows[0])){
      const nk = norm(k);
      if(aliasMap[nk]) score += 3;
      else for(const a of Object.keys(aliasMap)){ if(nk.includes(a)||a.includes(nk)){ score += 1; break; } }
    }
    return score;
  }

  function sheetToRows(ws, sheetName){
    if(!ws['!ref']) return { rows:[], layout:'empty', debugInfo:'Empty sheet' };
    const candidates = [
      { layout:'tabular',  rows: parseTabular(ws)  },
      { layout:'vertical', rows: parseVertical(ws) },
      { layout:'stacked',  rows: parseStacked(ws)  },
    ];
    candidates.forEach(c => c.score = scoreRows(c.rows));
    candidates.sort((a,b) => b.score - a.score);
    const best = candidates[0];
    const sampleKeys = best.rows.length ? Object.keys(best.rows[0]).slice(0,8).join(' | ') : 'none';
    const debugInfo = `"${sheetName}": layout=${best.layout}, score=${best.score}, members=${best.rows.length}, headers=[${sampleKeys}]`;
    console.log('[RBI Import]', debugInfo);
    return { rows: best.rows, layout: best.layout, debugInfo };
  }

  function parseRowsToMembers(rows){
    return rows.map(row=>{
      // ── Date of Birth ──
      const dob = col(row,'date of birth','dob','birthdate','birth date');
      let dobVal = '', ageVal = '';
      if(dob){
        const d = (dob instanceof Date) ? dob : new Date(dob);
        if(!isNaN(d.getTime())){
          // Use local date parts to avoid UTC timezone off-by-1 day bug
          dobVal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          ageVal = String(Math.floor((new Date()-d)/31557600000));
        } else { ageVal = col(row,'age'); }
      } else { ageVal = col(row,'age'); }
      // Strip formula strings (e.g. =DATEDIF...)
      if(ageVal.startsWith('=')) ageVal = '';

      // ── Sex ──
      const sex = col(row,'sex','gender','kasarian');
      const sexVal = /^f/i.test(sex) ? 'Female' : 'Male';

      // ── Civil Status ──
      const cs = col(row,'civil status','civilstatus','marital status');
      const csMap = {married:'Married',single:'Single',widowed:'Widowed',separated:'Separated'};
      const csVal = csMap[cs.toLowerCase()] || 'Single';

      // ── Citizenship ──
      const cit = col(row,'citizenship','nationality');
      const citVal = /foreigner|foreign/i.test(cit) ? 'Foreigner' : 'Filipino';

      // ── Education (handles typo ATTIANMENT) ──
      const edu = col(row,'education','educ','attainment','educational attainment','educational attianment');
      const eduOptions = [
        {k:'Elementary',   v:'Elementary'},
        {k:'High School',  v:'High School'},
        {k:'Senior High',  v:'High School'},
        {k:'Vocational',   v:'Vocational'},
        {k:'College',      v:'College'},
        {k:'Post-Graduate',v:'Post-Graduate'},
        {k:'None',         v:'None'},
      ];
      let eduVal = '';
      for(const {k,v} of eduOptions){ if(edu.toLowerCase().includes(k.toLowerCase())){ eduVal=v; break; } }

      // ── School Status — from separate IN SCHOOL / OUT OF SCHOOL columns ──
      const inSchool  = col(row,'in school','inschool');
      const outSchool = col(row,'out of school','outofschool','out of school youth','out of school children');
      const isStudent = col(row,'student','estudyante');
      const isTruthy = v => { const t=v.trim().toLowerCase(); return t==='yes'||t==='/'||t==='\\'||t==='x'||t==='1'||t==='✓'||t==='✔'||t==='oo'||t==='true'; };
      let ssVal = '';
      if(isTruthy(inSchool)||isTruthy(isStudent)) ssVal = 'In School';
      else if(isTruthy(outSchool)) ssVal = 'Out of School';

      // ── House Ownership ──
      const hoRaw = col(row,'house ownership','house','houseownership');
      const hoMap = {'owner':'Owner','renter':'Renter','rented':'Renter','rent':'Renter','shared':'Shared'};
      const hoVal = hoMap[hoRaw.trim().toLowerCase()] || (hoRaw&&hoRaw.toLowerCase()!=='na'?hoRaw:'');

      // ── House Type ──
      const htRaw = col(row,'house type','housetype','housing type','type of house');
      const htMap = {'concrete':'Concrete','wooden':'Wooden','semi-concrete':'Semi-Concrete','light':'Light Materials','makeshift':'Makeshift'};
      const htVal = htMap[htRaw.trim().toLowerCase()] || (htRaw&&htRaw.toLowerCase()!=='na'?htRaw:'');

      // ── Water Source (POTABLE WATER) ──
      const wsRaw = col(row,'water source','watersource','potable water');
      // Accept any value from the column (BCWD, etc.)
      const wsMap = {'faucet':'Faucet/NAWASA','nawasa':'Faucet/NAWASA','faucet/nawasa':'Faucet/NAWASA','bcwd':'BCWD','deep well':'Deepwell','deepwell':'Deepwell','shallow':'Deepwell','spring':'Deepwell','jetmatic':'Jetmatic','refilling':'Refilling Station','refilling station':'Refilling Station','river':'Refilling Station','rain':'Refilling Station'};
      let wsVal = '';
      const wsLow = wsRaw.toLowerCase();
      for(const [k,v] of Object.entries(wsMap)){ if(wsLow.includes(k)){ wsVal=v; break; } }
      if(!wsVal && wsRaw && wsRaw.toLowerCase()!=='na') wsVal = wsRaw;

      // ── Toilet Type ──
      const ttRaw = col(row,'toilet','toilet type','toilettype','type of toilet');
      const ttMap = {'flush':'Flush','water seal':'Water Seal','water sealed':'Water Seal','antipolo':'Antipolo','open pit':'None','none':'None'};
      let ttVal = '';
      const ttLow = ttRaw.toLowerCase();
      for(const [k,v] of Object.entries(ttMap)){ if(ttLow.includes(k)){ ttVal=v; break; } }

      // ── Lot Status ──
      const ltRaw = col(row,'lot status','lotstatus','lot');
      const ltMap = {'owned':'Owned','owner':'Owned','rented':'Rented','renter':'Rented','share':'Shared/Free Use'};
      const ltVal = ltMap[ltRaw.trim().toLowerCase()] || '';

      // ── Income ──
      const inc = col(row,'income','monthly income','monthly salary');
      let incVal = '';
      const incNum = parseFloat(String(inc).replace(/[^0-9.]/g,''));
      if(!isNaN(incNum)&&incNum>0){
        if(incNum<=5000) incVal='Below 5,000';
        else if(incNum<=10000) incVal='5,001-10,000';
        else if(incNum<=20000) incVal='10,001-20,000';
        else if(incNum<=30000) incVal='20,001-30,000';
        else incVal='Above 30,000';
      }

      // ── Government Benefits (GOVERNMENT BENEFECIARIES column) ──
      const govBen = col(row,'govt benefits','government benefeciaries','government beneficiaries').toLowerCase();
      const gov4ps    = colBool(row,'4ps','4p','pantawid') || govBen.includes('4p') || govBen.includes('pantawid');
      const govScension = colBool(row,'scension','senior citizen pension','social pension') || govBen.includes('scen') || govBen.includes('social pension') || govBen.includes('senior');
      const govIps    = colBool(row,'ips govt','ips program') || govBen.includes('ips') || govBen.includes('indigenous');
      const govMcct   = colBool(row,'mcct') || govBen.includes('mcct');
      const govUct    = colBool(row,'uct') || govBen.includes('uct');

      // ── Pensioner (PENSIONER column) ──
      const pensionerRaw = col(row,'pensioner','pension').toLowerCase();
      const pensionerSSS  = colBool(row,'sss') || pensionerRaw.includes('sss') || pensionerRaw.includes('social security');
      const pensionerGSIS = colBool(row,'gsis') || pensionerRaw.includes('gsis') || pensionerRaw.includes('government service');

      // ── PWD / OFW / Solo Parent ──
      const isPWD = colBool(row,'pwd','disability','person with disability');
      const isOFW = colBool(row,'ofw','overseas');

      // Solo parent — value can be 'MOTHER', 'FATHER', '/', 'YES', 'NO', 'NA'
      const soloRaw = col(row,'solo parent','soloparent').toLowerCase().trim();
      const soloMotherRaw = col(row,'solo mother','solo parent mother').toLowerCase().trim();
      const soloFatherRaw = col(row,'solo father','solo parent father').toLowerCase().trim();
      const isSoloMother = /mother|ina/i.test(soloRaw) || isTruthy(soloMotherRaw) || colBool(row,'solo mother');
      const isSoloFather = /father|ama/i.test(soloRaw) || isTruthy(soloFatherRaw) || colBool(row,'solo father');
      const isSoloParent = isSoloMother || isSoloFather || isTruthy(soloRaw);

      const isIP = colBool(row,'ip','indigenous','lumad');
      const isVoter = colBool(row,'voter','registered voter');
      const occ = col(row,'occupation','work','job','employment','hanapbuhay');

      const special = [];
      if(isPWD) special.push('PWD');
      if(isSoloMother) special.push('Solo Parent (Mother)');
      if(isSoloFather) special.push('Solo Parent (Father)');
      if(isSoloParent && !isSoloMother && !isSoloFather) special.push('Solo Parent');
      if(isOFW) special.push('OFW');
      if(isIP) special.push('IP');
      if(occ && occ.toLowerCase()!=='na' && occ.toLowerCase()!=='student') special.push('Labor/Employed');

      return {
        lastName:       col(row,'last name','lastname','surname','family name','apelyido'),
        firstName:      col(row,'first name','firstname','given name','givenname','pangalan'),
        middleName:     col(row,'middle name','middlename','maiden'),
        ext:            col(row,'ext','extensions','suffix','extension'),
        placeOfBirth:   col(row,'place of birth','placeofbirth','birthplace','birth place'),
        dateOfBirth:    dobVal,
        age:            ageVal,
        sex:            sexVal,
        civilStatus:    csVal,
        citizenship:    citVal,
        religion:       col(row,'religion','religious affiliation','relihiyon'),
        education:      eduVal,
        school:         col(row,'school','school name','paaralan'),
        schoolStatus:   ssVal,
        birthCert:      col(row,'birth cert','birthcert','birth certificate'),
        houseOwnership: hoVal,
        houseType:      htVal,
        waterSource:    wsVal,
        toiletType:     ttVal,
        lotStatus:      ltVal,
        occupation:     (occ&&occ.toLowerCase()!=='na') ? occ : '',
        privateEmployee:col(row,'private employee','private employer','private company'),
        publicEmployee: col(row,'public employee','government employee'),
        income:         incVal,
        otherIncome:    col(row,'other income','otherincome','other source','other source of income'),
        govScension, gov4ps, govIps, govMcct, govUct,
        pensionerSSS, pensionerGSIS,
        isPWD, isSoloMother, isSoloFather, isSoloParent, isOFW, isIP, isVoter,
        isBoarder:      colBool(row,'boarder','nakatira'),
        cigarette:      colBool(row,'cigarette','cigaratte','cigarette user','cigaratte user','smoker','tobacco'),
        alcohol:        colBool(row,'alcohol','alcohol user','drinker','liquor'),
        special,
      };
    });
  }

  let imported = 0;
  let skipped = 0;
  const debugLines = [];

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    const { rows, layout, debugInfo } = sheetToRows(ws, sheetName);
    debugLines.push(debugInfo);

    if(!rows.length){ skipped++; return; }

    // Each sheet = one household; all rows = members
    const members = parseRowsToMembers(rows);
    const validMembers = members.filter(m => m.lastName || m.firstName);
    if(!validMembers.length){ skipped++; return; }
    DB.push({
      id: 'HH-'+(DB.length+1).toString().padStart(4,'0'),
      region:'XIII', province:'Agusan del Norte', city:'Butuan City', barangay:'Pangabugan',
      address: selectedPurok, hhNo: sheetName, lotOwner:'', lotSite:'',
      members: validMembers, createdAt: new Date().toISOString()
    });
    imported++;
  });

  save();
  renderDashboard();
  updateBadge();
  showPage('records', document.querySelector('.nav-item[data-page="records"]'));
  renderRecords();
  if(imported){
    toast(`✅ Imported ${imported} household(s) → ${selectedPurok}${skipped?' ('+skipped+' skipped)':''}`);
  } else {
    // Show debug info in a longer toast + console
    console.warn('[RBI Import] All sheets skipped. Debug:\n' + debugLines.join('\n'));
    // Show an alert with details so user can diagnose
    const dbg = debugLines.map((d,i)=>`Sheet ${i+1}: ${d}`).join('\n');
    alert('⚠️ No households were imported.\n\nWhat was found in the Excel:\n' + dbg + '\n\nMake sure your column headers are:\n• Last Name / Apelyido\n• First Name / Pangalan\n\nOr send a screenshot of your Excel so we can fix it.');
  }
}


let currentMemberIdx = 0;

function selectMember(idx){
  currentMemberIdx = idx;
  // Hide all member detail cards (use class, not id prefix to avoid catching wrapper)
  document.querySelectorAll('.member-detail-card').forEach(el=>el.style.display='none');
  // Show selected
  const panel = document.getElementById('member-detail-'+idx);
  if(panel) panel.style.display='block';
  // Update active state on left list
  document.querySelectorAll('.member-item-clickable').forEach(el=>el.classList.remove('member-active'));
  const item = document.getElementById('member-item-'+idx);
  if(item) item.classList.add('member-active');
}

function editCurrentMember(hhId){
  const hh = DB.find(h=>h.id===hhId);
  if(!hh) return;
  const m = hh.members[currentMemberIdx];
  if(!m) return;
  const isHead = currentMemberIdx===0;
  const name = (m.lastName||'') + ', ' + (m.firstName||'');
  document.getElementById('member-edit-title').innerHTML =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:-1px;margin-right:6px"><path d="M11.7 2.3a1 1 0 011.4 1.4L4.4 12.4l-2.1.6.6-2.1 8.8-8.6z"/></svg>'
    + 'Edit: ' + name
    + (isHead ? ' <span style="font-size:10px;background:var(--gold);color:var(--navydk);padding:2px 8px;border-radius:3px;font-weight:700;margin-left:6px">HEAD</span>' : '');

  // Build the form directly — no DOM tricks
  const d = m;
  document.getElementById('member-edit-body').innerHTML = `
    <div class="member-card ${isHead?'is-head':''}" style="border:none;padding:0;background:transparent">
      <div class="member-section">
        <div class="member-section-title">Personal Information</div>
        <div class="member-grid cols5">
          <div class="form-group" style="grid-column:span 2"><label>Last Name</label><input class="m-ln" value="${esc(d.lastName||'')}"></div>
          <div class="form-group" style="grid-column:span 2"><label>First Name</label><input class="m-fn" value="${esc(d.firstName||'')}"></div>
          <div class="form-group"><label>Ext. (Jr/Sr/III)</label><input class="m-ext" value="${esc(d.ext||'')}"></div>
        </div>
        <div class="member-grid cols4" style="margin-top:10px">
          <div class="form-group"><label>Middle Name</label><input class="m-mn" value="${esc(d.middleName||'')}"></div>
          <div class="form-group"><label>Place of Birth</label><input class="m-pob" value="${esc(d.placeOfBirth||'')}"></div>
          <div class="form-group"><label>Date of Birth</label><input class="m-dob" type="date" value="${d.dateOfBirth||''}" onchange="calcAge(this)"></div>
          <div class="form-group"><label>Age</label><input class="m-age" value="${d.age||''}" readonly></div>
        </div>
      </div>
      <div class="member-section">
        <div class="member-section-title">Demographics</div>
        <div class="member-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="form-group"><label>Sex</label>
            <select class="m-sex">
              <option value="">— Select —</option>
              <option ${d.sex==='Male'?'selected':''}>Male</option>
              <option ${d.sex==='Female'?'selected':''}>Female</option>
            </select>
          </div>
          <div class="form-group"><label>Civil Status</label>
            <select class="m-cs">
              <option value="Single" ${(d.civilStatus||'Single')==='Single'?'selected':''}>Single</option>
              <option value="Married" ${d.civilStatus==='Married'?'selected':''}>Married</option>
              <option value="Widowed" ${d.civilStatus==='Widowed'?'selected':''}>Widowed</option>
              <option value="Separated" ${d.civilStatus==='Separated'?'selected':''}>Separated</option>
            </select>
          </div>
          <div class="form-group"><label>Citizenship</label>
            <select class="m-cit">
              <option value="Filipino" ${d.citizenship!=='Foreigner'?'selected':''}>Filipino</option>
              <option value="Foreigner" ${d.citizenship==='Foreigner'?'selected':''}>Foreigner</option>
            </select>
          </div>
          <div class="form-group"><label>Religion</label><input class="m-rel" value="${esc(d.religion||'')}"></div>
        </div>
      </div>
      <div class="member-section">
        <div class="member-section-title">Education &amp; School Status</div>
        <div class="member-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="form-group"><label>Educational Attainment</label>
            <select class="m-edu">
              <option value="">— Select —</option>
              <option ${d.education==='No Grade'?'selected':''}>No Grade</option>
              <option ${d.education==='Elementary'?'selected':''}>Elementary</option>
              <option ${d.education==='High School'?'selected':''}>High School</option>
              <option ${d.education==='College Level'?'selected':''}>College Level</option>
              <option ${d.education==='College Graduate'?'selected':''}>College Graduate</option>
              <option ${d.education==='Vocational'?'selected':''}>Vocational</option>
              <option ${d.education==='Post Graduate'?'selected':''}>Post Graduate</option>
            </select>
          </div>
          <div class="form-group"><label>School (Name)</label><input class="m-school" value="${esc(d.school||'')}"></div>
          <div class="form-group"><label>School Status</label>
            <select class="m-schoolstatus">
              <option value="">— Select —</option>
              <option value="In School" ${d.schoolStatus==='In School'?'selected':''}>In School</option>
              <option value="Out of School" ${d.schoolStatus==='Out of School'?'selected':''}>Out of School</option>
              <option value="Not Applicable" ${d.schoolStatus==='Not Applicable'?'selected':''}>Not Applicable</option>
            </select>
          </div>
          <div class="form-group"><label>Birth Certificate</label>
            <select class="m-birthcert">
              <option value="With Birth Cert." ${(d.birthCert||'With Birth Cert.')==='With Birth Cert.'?'selected':''}>With Birth Cert.</option>
              <option value="Without Birth Cert." ${d.birthCert==='Without Birth Cert.'?'selected':''}>Without Birth Cert.</option>
            </select>
          </div>
        </div>
      </div>
      <div class="member-section">
        <div class="member-section-title">Housing &amp; Lot Information</div>
        <div class="member-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="form-group"><label>House Ownership</label>
            <select class="m-house">
              <option value="">— Select —</option>
              <option value="Owner" ${d.houseOwnership==='Owner'?'selected':''}>Owner</option>
              <option value="Renter" ${d.houseOwnership==='Renter'?'selected':''}>Renter</option>
            </select>
          </div>
          <div class="form-group"><label>Type of House</label>
            <select class="m-housetype">
              <option value="">— Select —</option>
              <option value="Concrete" ${d.houseType==='Concrete'?'selected':''}>Concrete</option>
              <option value="Wooden" ${d.houseType==='Wooden'?'selected':''}>Wooden</option>
              <option value="Semi-Concrete" ${d.houseType==='Semi-Concrete'?'selected':''}>Semi-Concrete</option>
            </select>
          </div>
          <div class="form-group"><label>Potable Water Source</label>
            <select class="m-water">
              <option value="">— Select —</option>
              <option value="BCWD" ${d.waterSource==='BCWD'?'selected':''}>BCWD</option>
              <option value="Deepwell" ${d.waterSource==='Deepwell'?'selected':''}>Deepwell</option>
              <option value="Jetmatic" ${d.waterSource==='Jetmatic'?'selected':''}>Jetmatic</option>
              <option value="Refilling Station" ${d.waterSource==='Refilling Station'?'selected':''}>Refilling Station</option>
              <option value="Faucet/NAWASA" ${d.waterSource==='Faucet/NAWASA'?'selected':''}>Faucet/NAWASA</option>
            </select>
          </div>
          <div class="form-group"><label>Type of Toilet</label>
            <select class="m-toilet">
              <option value="">— Select —</option>
              <option value="Flush" ${d.toiletType==='Flush'?'selected':''}>Flush</option>
              <option value="Water Seal" ${d.toiletType==='Water Seal'?'selected':''}>Water Seal</option>
              <option value="Water Sealed" ${d.toiletType==='Water Sealed'?'selected':''}>Water Sealed</option>
              <option value="Antipolo" ${d.toiletType==='Antipolo'?'selected':''}>Antipolo</option>
              <option value="None" ${d.toiletType==='None'?'selected':''}>None</option>
            </select>
          </div>
        </div>
        <div class="member-grid cols3" style="margin-top:10px">
          <div class="form-group"><label>Lot</label>
            <select class="m-lot">
              <option value="">— Select —</option>
              <option value="Owner" ${d.lotStatus==='Owner'?'selected':''}>Owner</option>
              <option value="Renter" ${d.lotStatus==='Renter'?'selected':''}>Renter</option>
              <option value="Brgy. Site" ${d.lotStatus==='Brgy. Site'?'selected':''}>Brgy. Site</option>
              <option value="CRBDP" ${d.lotStatus==='CRBDP'?'selected':''}>CRBDP</option>
            </select>
          </div>
        </div>
      </div>
      <div class="member-section">
        <div class="member-section-title">Employment &amp; Income</div>
        <div class="member-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="form-group"><label>Occupation</label><input class="m-occ" value="${esc(d.occupation||'')}"></div>
          <div class="form-group"><label>Private Employee (Specify)</label><input class="m-privemp" value="${esc(d.privateEmployee||'')}"></div>
          <div class="form-group"><label>Public Employee (Specify)</label><input class="m-pubexp" value="${esc(d.publicEmployee||'')}"></div>
          <div class="form-group"><label>Monthly Income (₱)</label><input class="m-inc" type="number" value="${d.income||''}"></div>
        </div>
        <div class="member-grid cols2" style="margin-top:10px">
          <div class="form-group"><label>Other Sources of Income / Business</label><input class="m-otherinc" value="${esc(d.otherIncome||'')}"></div>
        </div>
      </div>
      <div class="member-section">
        <div class="member-section-title">Government Beneficiaries &amp; Programs</div>
        <div class="member-checks">
          <label class="check-item"><input type="checkbox" class="m-scension" ${d.govScension?'checked':''}> SOCIAL PENSION</label>
          <label class="check-item"><input type="checkbox" class="m-4ps" ${d.gov4ps?'checked':''}> 4P's</label>
          <label class="check-item"><input type="checkbox" class="m-ips" ${d.govIps?'checked':''}> IP's</label>
          <label class="check-item"><input type="checkbox" class="m-mcct" ${d.govMcct?'checked':''}> MCCT</label>
          <label class="check-item"><input type="checkbox" class="m-uct" ${d.govUct?'checked':''}> UCT</label>
        </div>
      </div>
      <div class="member-section">
        <div class="member-section-title">Special Categories &amp; Classifications</div>
        <div class="member-checks">
          <label class="check-item"><input type="checkbox" class="m-sss" ${d.pensionerSSS?'checked':''}> Pensioner (SSS)</label>
          <label class="check-item"><input type="checkbox" class="m-gsis" ${d.pensionerGSIS?'checked':''}> Pensioner (GSIS)</label>
          <label class="check-item"><input type="checkbox" class="m-pwd" ${d.isPWD?'checked':''}> PWD</label>
          <label class="check-item"><input type="checkbox" class="m-solo-mother" ${d.isSoloMother?'checked':''}> Solo Parent (Mother)</label>
          <label class="check-item"><input type="checkbox" class="m-solo-father" ${d.isSoloFather?'checked':''}> Solo Parent (Father)</label>
          <label class="check-item"><input type="checkbox" class="m-ofw" ${d.isOFW?'checked':''}> OFW</label>
          <label class="check-item"><input type="checkbox" class="m-ip" ${d.isIP?'checked':''}> Indigenous Person (IP)</label>
          <label class="check-item"><input type="checkbox" class="m-voter" ${d.isVoter?'checked':''}> Registered Voter</label>
          <label class="check-item"><input type="checkbox" class="m-boarder" ${d.isBoarder?'checked':''}> Boarder</label>
          <label class="check-item"><input type="checkbox" class="m-cig" ${d.cigarette?'checked':''}> Cigarette User</label>
          <label class="check-item"><input type="checkbox" class="m-alc" ${d.alcohol?'checked':''}> Alcohol User</label>
        </div>
      </div>
    </div>
  `;
  document.getElementById('member-edit-modal').classList.add('open');
}

function addMemberRowToContainer(data, container, isHead){
  // unused — kept for safety
}


function closeMemberEditModal(){
  document.getElementById('member-edit-modal').classList.remove('open');
  document.getElementById('member-edit-body').innerHTML='';
}

function saveMemberEdit(){
  const hhId = currentViewId;
  const hh = DB.find(h=>h.id===hhId);
  if(!hh) return;
  const body = document.getElementById('member-edit-body');
  if(!body){toast('Error: form not found');return;}
  const get = cls => body.querySelector(cls);
  const updated = {
    lastName:        get('.m-ln').value.trim(),
    firstName:       get('.m-fn').value.trim(),
    middleName:      get('.m-mn').value.trim(),
    ext:             get('.m-ext').value.trim(),
    placeOfBirth:    get('.m-pob').value.trim(),
    dateOfBirth:     get('.m-dob').value,
    age:             get('.m-age').value,
    sex:             get('.m-sex').value,
    civilStatus:     get('.m-cs').value,
    citizenship:     get('.m-cit').value,
    religion:        get('.m-rel').value.trim(),
    education:       get('.m-edu').value,
    school:          get('.m-school').value.trim(),
    schoolStatus:    get('.m-schoolstatus').value,
    birthCert:       get('.m-birthcert').value,
    houseOwnership:  get('.m-house').value,
    houseType:       get('.m-housetype').value,
    waterSource:     get('.m-water').value,
    toiletType:      get('.m-toilet').value,
    lotStatus:       get('.m-lot').value,
    occupation:      get('.m-occ').value.trim(),
    privateEmployee: get('.m-privemp').value.trim(),
    publicEmployee:  get('.m-pubexp').value.trim(),
    income:          get('.m-inc').value,
    otherIncome:     get('.m-otherinc').value.trim(),
    govScension:     get('.m-scension').checked,
    gov4ps:          get('.m-4ps').checked,
    govIps:          get('.m-ips').checked,
    govMcct:         get('.m-mcct').checked,
    govUct:          get('.m-uct').checked,
    pensionerSSS:    get('.m-sss').checked,
    pensionerGSIS:   get('.m-gsis').checked,
    isPWD:           get('.m-pwd').checked,
    isSoloMother:    get('.m-solo-mother').checked,
    isSoloFather:    get('.m-solo-father').checked,
    isSoloParent:    get('.m-solo-mother').checked || get('.m-solo-father').checked,
    isOFW:           get('.m-ofw').checked,
    isIP:            get('.m-ip').checked,
    isVoter:         get('.m-voter').checked,
    isBoarder:       get('.m-boarder').checked,
    cigarette:       get('.m-cig').checked,
    alcohol:         get('.m-alc').checked,
  };
  const sp=[];
  if(updated.isPWD) sp.push('PWD');
  if(updated.isSoloMother) sp.push('Solo Parent (Mother)');
  if(updated.isSoloFather) sp.push('Solo Parent (Father)');
  if(updated.isOFW) sp.push('OFW');
  if(updated.isIP) sp.push('IP');
  if(updated.govScension) sp.push('SOCIAL PENSION');
  if(updated.gov4ps) sp.push("4P's");
  if(updated.govMcct) sp.push('MCCT');
  if(updated.govUct) sp.push('UCT');
  if(updated.occupation) sp.push('Labor/Employed');
  updated.special = sp;
  hh.members[currentMemberIdx] = updated;
  save();
  closeMemberEditModal();
  toast('✅ Member updated successfully!');
  const idx = currentMemberIdx;
  viewHousehold(hhId);
  setTimeout(()=>selectMember(idx), 80);
}

// ══════════════════════════════════════════════════════════════
// DECEASED MEMBER HANDLING
// ══════════════════════════════════════════════════════════════
let _deceasedHHId = null;
let _deceasedMemberIdx = null;

function openDeceasedModal(hhId){
  const hh = DB.find(h=>h.id===hhId);
  if(!hh) return;
  const idx = currentMemberIdx;
  const m = hh.members[idx];
  if(!m){ toast('Please select a member first.'); return; }

  _deceasedHHId = hhId;
  _deceasedMemberIdx = idx;

  // Set member name
  document.getElementById('deceased-member-name').textContent =
    '🕊 ' + (m.lastName||'') + ', ' + (m.firstName||'') + (m.middleName?' '+m.middleName:'') + (m.ext?' '+m.ext:'');

  // Default date of death = today
  document.getElementById('deceased-dod').value = new Date().toISOString().split('T')[0];

  // If head (idx===0) and there are other members, show new-head-select
  const newHeadSection = document.getElementById('new-head-section');
  const newHeadSelect = document.getElementById('new-head-select');
  newHeadSelect.innerHTML = '';
  if(idx === 0 && hh.members.length > 1){
    newHeadSection.style.display = 'block';
    hh.members.forEach((mem, i) => {
      if(i === 0) return; // skip deceased head
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = (i+1)+'. ' + (mem.lastName||'—') + ', ' + (mem.firstName||'—') + ' (' + (mem.sex||'?') + ', ' + (mem.age||'?') + ' yrs)';
      newHeadSelect.appendChild(opt);
    });
  } else {
    newHeadSection.style.display = 'none';
  }

  // Reset radio to "remove"
  document.querySelector('input[name="deceased-action"][value="remove"]').checked = true;

  document.getElementById('deceased-modal').classList.add('open');
}

function closeDeceasedModal(){
  document.getElementById('deceased-modal').classList.remove('open');
  _deceasedHHId = null;
  _deceasedMemberIdx = null;
}

function confirmDeceased(){
  const hh = DB.find(h=>h.id===_deceasedHHId);
  if(!hh){ closeDeceasedModal(); return; }

  const idx = _deceasedMemberIdx;
  const m = hh.members[idx];
  if(!m){ closeDeceasedModal(); return; }

  const dod = document.getElementById('deceased-dod').value;
  const action = document.querySelector('input[name="deceased-action"]:checked').value;
  const isHead = idx === 0;

  // If head is deceased and there are other members — promote new head
  if(isHead && hh.members.length > 1){
    const newHeadSelect = document.getElementById('new-head-select');
    const newHeadIdx = parseInt(newHeadSelect.value);
    if(!isNaN(newHeadIdx) && hh.members[newHeadIdx]){
      // Move new head to position 0
      const newHead = hh.members.splice(newHeadIdx, 1)[0];
      // Remove deceased head (now at idx 0 again after splice)
      if(action === 'keep'){
        m.isDeceased = true;
        m.dateOfDeath = dod;
        hh.members.splice(0, 1); // remove old head from index 0
        hh.members.unshift(newHead); // new head at front
        // add deceased member after (at end) if keeping
        hh.members.push(m);
      } else {
        hh.members.splice(0, 1); // remove deceased head
        hh.members.unshift(newHead); // new head at front
      }
      toast(`✅ ${newHead.lastName}, ${newHead.firstName} is now the new Household Head.`);
    }
  } else if(action === 'keep'){
    // Keep but mark deceased
    hh.members[idx].isDeceased = true;
    hh.members[idx].dateOfDeath = dod;
    toast(`🕊 ${m.lastName}, ${m.firstName} marked as Deceased.`);
  } else {
    // Remove from household
    hh.members.splice(idx, 1);
    toast(`🕊 ${m.lastName}, ${m.firstName} removed from the household record.`);
  }

  // If household has no members left, remove it
  if(hh.members.length === 0){
    DB = DB.filter(h=>h.id!==_deceasedHHId);
    save();
    closeDeceasedModal();
    renderRecords();
    renderDashboard();
    updateBadge();
    showPage('records', document.querySelector('.nav-item[data-page="records"]'));
    toast('🕊 Household removed — no remaining members.');
    return;
  }

  save();
  renderDashboard();
  updateBadge();
  const finalHHId = hh.id;
  closeDeceasedModal();
  viewHousehold(finalHHId);
}

// Add event listener for deceased modal backdrop
document.addEventListener('DOMContentLoaded',()=>{
  const dm = document.getElementById('deceased-modal');
  if(dm) dm.addEventListener('click',e=>{if(e.target===e.currentTarget)closeDeceasedModal();});
});

function onSearchInput(){
  const val = document.getElementById('search-input').value;
  document.getElementById('search-clear-btn').style.display = val ? 'block' : 'none';
  renderRecords();
}

function clearSearch(){
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear-btn').style.display = 'none';
  renderRecords();
}


function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

// Modal close on backdrop
document.getElementById('hh-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
document.getElementById('member-edit-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeMemberEditModal();});


function toggleSidebar(){
  const sidebar=document.querySelector('.sidebar');
  const overlay=document.getElementById('sidebar-overlay');
  const isOpen=sidebar.classList.toggle('open');
  if(overlay) overlay.classList.toggle('show', isOpen);
  const closeBtn=document.getElementById('sidebar-close-btn');
  const hamburgerBtn=document.querySelector('.hamburger-btn');
  if(closeBtn) closeBtn.style.display=isOpen?'block':'none';
  if(hamburgerBtn) hamburgerBtn.style.display=isOpen?'none':'block';
}
// Show hamburger on small screens, hide X
function checkHamburger(){
  const btn=document.querySelector('.hamburger-btn');
  const closeBtn=document.getElementById('sidebar-close-btn');
  const sidebar=document.querySelector('.sidebar');
  const isMobile=window.innerWidth<=768;
  if(btn) btn.style.display=isMobile&&!sidebar.classList.contains('open')?'block':'none';
  // If resized to desktop, force close sidebar and hide X
  if(!isMobile){
    sidebar.classList.remove('open');
    if(closeBtn) closeBtn.style.display='none';
    const overlay=document.getElementById('sidebar-overlay');
    if(overlay) overlay.classList.remove('show');
  }
}
window.addEventListener('resize',checkHamburger);
checkHamburger();

// ══════════════════════════════════════════════════════════════
// GLOBAL TOPBAR SEARCH
// ══════════════════════════════════════════════════════════════
let _gsrIndex = -1; // keyboard nav index

function highlightMatch(text, query){
  if(!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<em>$1</em>');
}

function onGlobalSearch(val){
  const clearBtn = document.getElementById('global-search-clear');
  const resultsEl = document.getElementById('global-search-results');
  clearBtn.style.display = val ? 'block' : 'none';
  _gsrIndex = -1;

  const q = val.trim().toLowerCase();
  if(!q){ resultsEl.classList.remove('open'); return; }

  // Gather all matching members across all households
  const hits = [];
  DB.forEach(hh => {
    hh.members.forEach((m, mi) => {
      const fullName = [m.lastName, m.firstName, m.middleName].filter(Boolean).join(' ').toLowerCase();
      const hhId = (hh.id||'').toLowerCase();
      const purok = (hh.address||'').toLowerCase();
      const dob = (m.dateOfBirth||'').toLowerCase();
      const sex = (m.sex||'').toLowerCase();
      const rel = (m.relationship||'').toLowerCase();
      if(fullName.includes(q) || hhId.includes(q) || purok.includes(q) || dob.includes(q) || sex.includes(q) || rel.includes(q)){
        hits.push({ hh, m, mi });
      }
    });
  });

  if(!hits.length){
    resultsEl.innerHTML = `
      <div class="gsr-header">No Results</div>
      <div class="gsr-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6"/></svg>
        Walay nakita para sa "<strong>${val}</strong>"
      </div>`;
    resultsEl.classList.add('open');
    return;
  }

  const shown = hits.slice(0, 12);
  const displayName = m => [m.lastName, m.firstName, m.middleName].filter(Boolean).join(', ');
  const initials = m => ((m.firstName||'?')[0] + (m.lastName||'?')[0]).toUpperCase();

  resultsEl.innerHTML = `
    <div class="gsr-header">${hits.length} result${hits.length>1?'s':''} found${hits.length>12?' (showing top 12)':''}</div>
    ${shown.map(({hh,m,mi},i)=>{
      const isHead = mi===0 || m.relationship==='Household Head';
      const avatarClass = m.isDeceased?'deceased':isHead?'head':'';
      const dn = displayName(m);
      const hlName = highlightMatch(dn, val.trim());
      return `<div class="gsr-item" data-hhid="${hh.id}" tabindex="-1"
        onmousedown="selectGsrItem('${hh.id}')"
        onmouseover="setGsrHover(${i})">
        <div class="gsr-avatar ${avatarClass}">${initials(m)}</div>
        <div class="gsr-info">
          <div class="gsr-name">${hlName}${m.isDeceased?' <span style="color:#b91c1c;font-size:10px">✝</span>':''}</div>
          <div class="gsr-meta">Purok ${hh.address||'—'} · HH# ${hh.id} · ${m.sex||'—'} · ${m.age||'—'} yrs</div>
        </div>
        ${isHead?`<span class="gsr-badge">HEAD</span>`:''}
      </div>`;
    }).join('')}`;
  resultsEl.classList.add('open');
}

function setGsrHover(i){ _gsrIndex = i; }

function selectGsrItem(hhId){
  closeGlobalSearch();
  viewHousehold(hhId);
}

function onGlobalSearchKey(e){
  const resultsEl = document.getElementById('global-search-results');
  const items = resultsEl.querySelectorAll('.gsr-item');
  if(!items.length) return;
  if(e.key==='ArrowDown'){
    e.preventDefault();
    _gsrIndex = Math.min(_gsrIndex+1, items.length-1);
    items.forEach((el,i)=>el.classList.toggle('gsr-active',i===_gsrIndex));
    items[_gsrIndex]&&items[_gsrIndex].scrollIntoView({block:'nearest'});
  } else if(e.key==='ArrowUp'){
    e.preventDefault();
    _gsrIndex = Math.max(_gsrIndex-1, 0);
    items.forEach((el,i)=>el.classList.toggle('gsr-active',i===_gsrIndex));
    items[_gsrIndex]&&items[_gsrIndex].scrollIntoView({block:'nearest'});
  } else if(e.key==='Enter'){
    if(_gsrIndex>=0 && items[_gsrIndex]){
      const hhId = items[_gsrIndex].dataset.hhid;
      if(hhId) selectGsrItem(hhId);
    }
  } else if(e.key==='Escape'){
    closeGlobalSearch();
  }
}

function clearGlobalSearch(){
  document.getElementById('global-search-input').value='';
  document.getElementById('global-search-clear').style.display='none';
  document.getElementById('global-search-results').classList.remove('open');
  _gsrIndex=-1;
}

function closeGlobalSearch(){
  clearGlobalSearch();
  document.getElementById('global-search-input').blur();
}

// Close dropdown when clicking outside
document.addEventListener('click', e=>{
  const wrap = document.getElementById('global-search-wrap');
  if(wrap && !wrap.contains(e.target)){
    document.getElementById('global-search-results').classList.remove('open');
    _gsrIndex=-1;
  }
});

// Init
renderDashboard();
updateBadge();
populatePurokFilter();
renderTopbarActions('');
