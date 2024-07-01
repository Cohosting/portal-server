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

const chart = new window.Chart(ctx, {
  type: "bar",
  data: {
    labels: months,
    datasets: [
      {
        label: "Revenue",
        backgroundColor: "#d3ff4c",
        borderColor: "rgba(255, 99, 132, 1)",
        data: [1],
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
console.log(chart);
