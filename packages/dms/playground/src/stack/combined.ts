import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  HStack,
  Placeholder,
  Spacer,
  VStack,
} from "@antelopejs/interface-dms/base";
import { stackCategory } from "./category";

@RegisterPage()
export class PageStackCombined extends PageController("stack-combined", {
  displayName: "Combined Stack Layout",
  icon: "i-ph-layout",
  category: stackCategory,
  order: 30,
  description: "Complex layouts combining HStack, VStack, and Spacer",
}) {
  static mainContent = (() => {
    const logo = Placeholder({ label: "Logo", height: "60px", width: "60px" });
    const title = Placeholder({
      label: "Dashboard Title",
      height: "60px",
      width: "200px",
    });
    const search = Placeholder({
      label: "Search",
      height: "60px",
      width: "250px",
    });
    const notifications = Placeholder({
      label: "🔔",
      height: "60px",
      width: "60px",
    });
    const profile = Placeholder({ label: "👤", height: "60px", width: "60px" });

    const headerActions = HStack({ spacing: "12px", alignment: "center" })
      .child("search", search)
      .child("notifications", notifications)
      .child("profile", profile);

    const header = HStack({ spacing: "16px", alignment: "center" })
      .child("logo", logo)
      .child("title", title)
      .child("spacer", Spacer())
      .child("actions", headerActions);

    const nav1 = Placeholder({ label: "📊 Dashboard", height: "50px" });
    const nav2 = Placeholder({ label: "📁 Projects", height: "50px" });
    const nav3 = Placeholder({ label: "👥 Team", height: "50px" });
    const nav4 = Placeholder({ label: "⚙️ Settings", height: "50px" });
    const navFooter = Placeholder({ label: "❓ Help", height: "50px" });

    const sidebar = VStack({ spacing: "12px", alignment: "stretch" })
      .child("nav1", nav1)
      .child("nav2", nav2)
      .child("nav3", nav3)
      .child("nav4", nav4)
      .child("spacer", Spacer())
      .child("footer", navFooter);

    const card1 = Placeholder({ label: "Stats Card 1", height: "150px" });
    const card2 = Placeholder({ label: "Stats Card 2", height: "150px" });
    const card3 = Placeholder({ label: "Stats Card 3", height: "150px" });

    const statsRow = HStack({ spacing: "20px", alignment: "stretch" })
      .child("card1", card1)
      .child("card2", card2)
      .child("card3", card3);

    const mainChart = Placeholder({ label: "Main Chart", height: "300px" });
    const activityFeed = Placeholder({
      label: "Recent Activity",
      height: "250px",
    });

    const mainContent = VStack({ spacing: "24px", alignment: "stretch" })
      .child("stats", statsRow)
      .child("chart", mainChart)
      .child("activity", activityFeed);

    const contentArea = HStack({ spacing: "24px", alignment: "stretch" })
      .child("sidebar", sidebar)
      .child("main", mainContent);

    const footerLeft = Placeholder({
      label: "© 2024 Company",
      height: "50px",
      width: "200px",
    });
    const footerRight = Placeholder({
      label: "Version 1.0.0",
      height: "50px",
      width: "150px",
    });

    const footer = HStack({ spacing: "16px", alignment: "center" })
      .child("left", footerLeft)
      .child("spacer", Spacer())
      .child("right", footerRight);

    return VStack({ spacing: "24px", alignment: "stretch" })
      .child("header", header)
      .child("content", contentArea)
      .child("footer", footer);
  })();
}
