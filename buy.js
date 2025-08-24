async function loadFarmers() {   
  const res = await fetch("http://localhost:3000/api/assets");   
  const assets = await res.json();    

  const farmersContainer = document.getElementById("farmersContainer");   
  farmersContainer.innerHTML = "";    

  // Group assets by farmer   
  const farmerMap = {};   
  assets.forEach(a => {     
    if (!farmerMap[a.farmer_id]) farmerMap[a.farmer_id] = [];     
    farmerMap[a.farmer_id].push(a);   
  });    

  Object.keys(farmerMap).forEach(farmerId => {     
    const card = document.createElement("div");     
    card.className = "farmer-card";      

    const farmerAssets = farmerMap[farmerId];     
    
    card.innerHTML = `<h3>Farmer ID: ${farmerId}</h3>`;
    const list = document.createElement("ul");
    farmerAssets.forEach(asset => {
      const li = document.createElement("li");
      li.textContent = `${asset.kwh} kWh`;
      list.appendChild(li);
    });
    card.appendChild(list);
    
    const btn = document.createElement("button");     
    btn.textContent = "Purchase";     
    btn.addEventListener("click", () => {       
      alert(`Purchased certificates of Farmer ID ${farmerId}`);       
      // TODO: implement payment & token transfer     
    });     
    card.appendChild(btn);      

    farmersContainer.appendChild(card);   
  }); 
}  

window.onload = loadFarmers;