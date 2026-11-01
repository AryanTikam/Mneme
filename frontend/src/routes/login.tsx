import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoginPage } from "@/components/mneme/LoginPage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In or Register — Mneme" },
      { name: "description", content: "Sign in or create your learner profile in Mneme." },
    ],
  }),
  component: LoginRouteView,
});

function LoginRouteView() {
  const navigate = useNavigate();
  return <LoginPage onSuccess={() => navigate({ to: "/" })} />;
}

