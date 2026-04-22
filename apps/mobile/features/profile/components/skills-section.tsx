import { View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { StaffSkill } from "@sous/types";
import { StyledText } from "@/components/ui/text";

const STAR_FILLED_COLOR = "#f59e0b";
const STAR_EMPTY_COLOR = "#d6d3d1";

interface SkillsSectionProps {
  skills: StaffSkill[];
}

/**
 * View-only display of the staff member's approved stations and
 * proficiency levels. Mirrors the star-rating language used by the
 * web `StaffFormDialog` so the two surfaces feel like one product.
 *
 * Skills are manager-controlled (edited from the web dashboard), so
 * rows are deliberately not tappable here. Preferred stations are
 * intentionally omitted — they will become staff-editable from a
 * future mobile settings screen.
 */
export function SkillsSection({ skills }: SkillsSectionProps) {
  if (skills.length === 0) {
    return (
      <View className="bg-card border border-border rounded-md px-4 py-4">
        <StyledText
          variant="caption"
          className="text-muted-foreground text-sm"
        >
          No approved stations yet — ask your manager to add stations to
          your profile.
        </StyledText>
      </View>
    );
  }

  return (
    <View className="bg-card border border-border rounded-md overflow-hidden">
      {skills.map((skill, index) => (
        <View
          key={`${skill.station}-${index}`}
          className={`flex-row items-center justify-between px-4 py-3 ${
            index > 0 ? "border-t border-border" : ""
          }`}
        >
          <StyledText variant="body" className="flex-1 pr-3">
            {skill.station}
          </StyledText>
          <ProficiencyStars value={skill.proficiency} />
        </View>
      ))}
    </View>
  );
}

function ProficiencyStars({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <View
      className="flex-row"
      accessibilityLabel={`Proficiency ${clamped} of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialIcons
          key={i}
          name={i <= clamped ? "star" : "star-border"}
          size={16}
          color={i <= clamped ? STAR_FILLED_COLOR : STAR_EMPTY_COLOR}
          style={{ marginLeft: i === 1 ? 0 : 2 }}
        />
      ))}
    </View>
  );
}
