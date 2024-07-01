const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const handlePuppteer = async (req, res) => {
  // req.body --> location, min-max revenue, occupancy and nightly rates
  // Extract data from request body
  const {
    resultLocation,
    revenue,
    occupancy,
    nightly,
    monthsRevenue,
    resultId,
    reportURL,
  } = req.body;

  const data = {
    // Prepare data for injection
    resultLocation,
    resultId,
    reportURL,
    revenue: {
      min: revenue.min,
      max: revenue.max,
    },
    projections: {
      nightly: {
        min: nightly.min,
        max: nightly.max,
      },
      occupancy: {
        min: occupancy.min,
        max: occupancy.max,
      },
    },
  };

  const browser = await puppeteer.launch({
    headless: "headless", // Adjust if you want a visible Chrome window
    defaultViewport: null,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // Update Chrome path if needed
  });
  try {
    const page = await browser.newPage();

    // Read HTML content from separate file
    const filePath = path.join(__dirname, "pdf.html");
    await page.goto(`file://${filePath}`, { waitUntil: "networkidle0" });

    await page.waitForFunction(() => window.Chart !== undefined);

    // Inject data using page.evaluate
    await page.evaluate(
      (data, monthsRevenue) => {
        // Update HTML elements based on data
        document.querySelector("h1").textContent =
          data.title || "Dynamic Performance Report"; // Update title (optional)
        document.querySelector(".revenue p").textContent =
          `$${data.revenue.min} - $${data.revenue.max}`;
        document.querySelector(".location p").textContent = data.resultLocation;
        document
          .querySelector(".result_link")
          .setAttribute("href", data.reportURL);

        const projectionItems = document.querySelectorAll(
          ".projections__items p:nth-child(2)"
        );
        projectionItems[0].textContent = `$${data.projections.nightly.min} - $${data.projections.nightly.max}`;
        projectionItems[1].textContent = `${data.projections.occupancy.min}% - ${data.projections.occupancy.max}%`;

        const ctx = document.getElementById("myChart").getContext("2d");

        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "July",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];

        const chart = new Chart(ctx, {
          type: "bar",
          data: {
            labels: months,
            datasets: [
              {
                label: "Revenue",
                backgroundColor: "#d3ff4c",
                borderColor: "rgba(255, 99, 132, 1)",
                data: monthsRevenue,
              },
            ],
          },
          options: {
            scales: {
              yAxes: [
                {
                  ticks: {
                    beginAtZero: true,
                  },
                },
              ],
            },
          },
        });
        var qrcode = new QRCode(document.getElementById("qrcode"), {
          text: "https://webisora.com",
          width: 128,
          height: 128,

          correctLevel: QRCode.CorrectLevel.H,
        });
        return new Promise((resolve) => setTimeout(resolve, 2000));
      },
      data,
      monthsRevenue
    );

    await page.pdf({ path: "chart.pdf", format: "A4", printBackground: true });

    const pdfBuffer = await fs.readFileSync("chart.pdf");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Content-Disposition", 'attachment; filename="chart.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send("Error generating PDF");
  } finally {
    await browser.close();
  }
};

module.exports = handlePuppteer;
