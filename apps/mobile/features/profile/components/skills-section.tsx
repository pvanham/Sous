import { View, Pressable } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { StaffSkill } from "@sous/types";
import { StyledText } from "@/components/ui/text";

const STAR_FILLED_COLOR = "#f59e0b";
const STAR_EMPTY_COLOR = "#d6d3d1";
const PENDING_COLOR = "#b45309";
const ICON_COLOR = "#78716c";
const REMOVE_COLOR = "#dc2626";

/** A skill the staff member has proposed adding (not yet active). */
export interface PendingAddition {
  station: string;
  proficiency: number;
}

interface SkillsSectionProps {
  skills: StaffSkill[];
  /**
   * When `true`, the staff member may self-manage skills: an "Add
   * skills" button shows and active rows expose a "Request removal"
   * action (swipe-left or the kebab menu). When `false`, the section
   * is read-only (manager-controlled), matching the original behaviour.
   */
  canManage: boolean;
  /** Proposed additions awaiting manager approval. */
  pendingAdditions: PendingAddition[];
  /** Active stations with an open removal request (shown as pending). */
  pendingRemovalStations: Set<string>;
  onAddPress: () => void;
  onRequestRemoval: (station: string) => void;
}

/**
 * Display of the staff member's stations and proficiency levels.
 *
 * When self-service is enabled (`canManage`), staff can propose new
 * skills (queued for manager approval) and request removals (swipe-left
 * or the kebab menu). Both proposed additions and in-flight removals are
 * rendered in a distinct "pending" state until a manager acts on them.
 * Proficiency uses the same star language as the web dashboard so the
 * two surfaces feel like one product.
 */
export function SkillsSection({
  skills,
  canManage,
  pendingAdditions,
  pendingRemovalStations,
  onAddPress,
  onRequestRemoval,
}: SkillsSectionProps) {
  const hasContent = skills.length > 0 || pendingAdditions.length > 0;

  return (
    <View>
      {hasContent ? (
        <View className="bg-card border border-border rounded-md overflow-hidden">
          {skills.map((skill, index) => {
            const pendingRemoval = pendingRemovalStations.has(skill.station);
            return (
              <SkillRow
                key={`${skill.station}-${index}`}
                skill={skill}
                divider={index > 0}
                canManage={canManage}
                pendingRemoval={pendingRemoval}
                onRequestRemoval={() => onRequestRemoval(skill.station)}
              />
            );
          })}

          {pendingAdditions.map((addition, index) => (
            <PendingAdditionRow
              key={`pending-add-${addition.station}`}
              addition={addition}
              divider={skills.length > 0 || index > 0}
            />
          ))}
        </View>
      ) : (
        <View className="bg-card border border-border rounded-md px-4 py-4">
          <StyledText
            variant="caption"
            className="text-muted-foreground text-sm"
          >
            {canManage
              ? "No stations yet — add the stations you can work and your manager will confirm them."
              : "No approved stations yet — ask your manager to add stations to your profile."}
          </StyledText>
        </View>
      )}

      {canManage ? (
        <Pressable
          onPress={onAddPress}
          accessibilityRole="button"
          accessibilityLabel="Add skills"
          className="flex-row items-center justify-center gap-2 border border-border rounded-md px-4 py-3 mt-3 active:opacity-80"
        >
          <MaterialIcons name="add" size={18} color={ICON_COLOR} />
          <StyledText variant="label" className="text-base font-semibold">
            Add skills
          </StyledText>
        </Pressable>
      ) : null}
    </View>
  );
}

interface SkillRowProps {
  skill: StaffSkill;
  divider: boolean;
  canManage: boolean;
  pendingRemoval: boolean;
  onRequestRemoval: () => void;
}

function SkillRow({
  skill,
  divider,
  canManage,
  pendingRemoval,
  onRequestRemoval,
}: SkillRowProps) {
  const rowInner = (
    <View
      className={`flex-row items-center justify-between px-4 py-3 bg-card ${
        divider ? "border-t border-border" : ""
      }`}
    >
      <View className="flex-1 pr-3">
        <StyledText variant="body">{skill.station}</StyledText>
        {pendingRemoval ? (
          <View className="flex-row items-center mt-0.5">
            <MaterialIcons
              name="schedule"
              size={13}
              color={PENDING_COLOR}
            />
            <StyledText
              variant="caption"
              className="ml-1 text-xs text-amber-700"
            >
              Pending removal
            </StyledText>
          </View>
        ) : null}
      </View>
      <ProficiencyStars value={skill.proficiency} />
      {canManage && !pendingRemoval ? (
        <Pressable
          onPress={onRequestRemoval}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Request removal of ${skill.station}`}
          className="ml-2 -mr-1 w-8 h-8 items-center justify-center active:opacity-60"
        >
          <MaterialIcons name="more-vert" size={20} color={ICON_COLOR} />
        </Pressable>
      ) : null}
    </View>
  );

  // Read-only or already-pending rows don't expose the swipe action.
  if (!canManage || pendingRemoval) {
    return rowInner;
  }

  return (
    <Swipeable
      renderRightActions={() => (
        <Pressable
          onPress={onRequestRemoval}
          accessibilityRole="button"
          accessibilityLabel={`Request removal of ${skill.station}`}
          className="flex-row items-center justify-center px-5"
          style={{ backgroundColor: REMOVE_COLOR }}
        >
          <MaterialIcons name="remove-circle-outline" size={18} color="#fff" />
          <StyledText
            variant="label"
            className="ml-2 text-sm font-semibold text-white"
          >
            Request removal
          </StyledText>
        </Pressable>
      )}
      overshootRight={false}
    >
      {rowInner}
    </Swipeable>
  );
}

function PendingAdditionRow({
  addition,
  divider,
}: {
  addition: PendingAddition;
  divider: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3 bg-card ${
        divider ? "border-t border-border" : ""
      }`}
    >
      <View className="flex-1 pr-3">
        <StyledText variant="body" className="text-muted-foreground">
          {addition.station}
        </StyledText>
        <View className="flex-row items-center mt-0.5">
          <MaterialIcons name="schedule" size={13} color={PENDING_COLOR} />
          <StyledText
            variant="caption"
            className="ml-1 text-xs text-amber-700"
          >
            Pending approval
          </StyledText>
        </View>
      </View>
      <ProficiencyStars value={addition.proficiency} muted />
    </View>
  );
}

function ProficiencyStars({
  value,
  muted = false,
}: {
  value: number;
  muted?: boolean;
}) {
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
          color={
            i <= clamped
              ? muted
                ? STAR_EMPTY_COLOR
                : STAR_FILLED_COLOR
              : STAR_EMPTY_COLOR
          }
          style={{ marginLeft: i === 1 ? 0 : 2 }}
        />
      ))}
    </View>
  );
}
