export const Widget = ({ dialTo }: { dialTo: string }) => (
  <div
    style={{
      position: "fixed",
      bottom: 20,
      right: 20,
      padding: 10,
      border: "1px solid #ccc",
    }}
  >
    Chat Widget dialing to {dialTo}
  </div>
);
