document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnCarregarVR");
  if (!btn) return;

  btn.addEventListener("click", () => {
    document.getElementById("kFT").textContent = "15";
    document.getElementById("kCT").textContent = "4";
    document.getElementById("kRec").textContent = "2";
    document.getElementById("kTot").textContent = "21";

    document.getElementById("vrTbody").innerHTML = `
      <tr><td>18240</td><td>João Silva</td><td>Motorista</td><td>5</td><td>2</td><td><b>7</b></td></tr>
      <tr><td>12933</td><td>Maria Clara</td><td>Cobradora</td><td>4</td><td>1</td><td><b>5</b></td></tr>
      <tr><td>15422</td><td>Carlos Pereira</td><td>Motorista</td><td>6</td><td>1</td><td><b>7</b></td></tr>
    `;

    document.getElementById("vrLog").textContent = "Dados carregados com sucesso!";
  });
});

