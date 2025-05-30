import {
  ExperimentInterfaceStringDates,
  LinkedFeatureInfo,
} from "back-end/types/experiment";
import { VisualChangesetInterface } from "back-end/types/visual-changeset";
import { includeExperimentInPayload, isDefined } from "shared/util";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { getDemoDatasourceProjectIdForOrganization } from "shared/demo-datasource";
import { useRouter } from "next/router";
import { DifferenceType } from "back-end/types/stats";
import { URLRedirectInterface } from "back-end/types/url-redirect";
import { FaChartBar } from "react-icons/fa";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import FeatureFromExperimentModal from "@/components/Features/FeatureModal/FeatureFromExperimentModal";
import Modal from "@/components/Modal";
import HistoryTable from "@/components/HistoryTable";
import {
  getBrowserDevice,
  openVisualEditor,
} from "@/components/OpenVisualEditorLink";
import useApi from "@/hooks/useApi";
import { useUser } from "@/services/UserContext";
import useSDKConnections from "@/hooks/useSDKConnections";
import DiscussionThread from "@/components/DiscussionThread";
import { useAuth } from "@/services/auth";
import { DeleteDemoDatasourceButton } from "@/components/DemoDataSourcePage/DemoDataSourcePage";
import { phaseSummary } from "@/services/utils";
import EditStatusModal from "@/components/Experiment/EditStatusModal";
import VisualChangesetModal from "@/components/Experiment/VisualChangesetModal";
import { useSnapshot } from "@/components/Experiment/SnapshotProvider";
import { ResultsMetricFilters } from "@/components/Experiment/Results";
import UrlRedirectModal from "@/components/Experiment/UrlRedirectModal";
import CustomMarkdown from "@/components/Markdown/CustomMarkdown";
import BanditSummaryResultsTab from "@/components/Experiment/TabbedPage/BanditSummaryResultsTab";
import Button from "@/components/Radix/Button";
import ExperimentHeader from "./ExperimentHeader";
import SetupTabOverview from "./SetupTabOverview";
import Implementation from "./Implementation";
import ResultsTab from "./ResultsTab";
import StoppedExperimentBanner from "./StoppedExperimentBanner";
import HealthTab from "./HealthTab";

const experimentTabs = ["overview", "results", "explore", "health"] as const;
export type ExperimentTab = typeof experimentTabs[number];

export interface Props {
  experiment: ExperimentInterfaceStringDates;
  linkedFeatures: LinkedFeatureInfo[];
  mutate: () => void;
  duplicate?: (() => void) | null;
  editTags?: (() => void) | null;
  checklistItemsRemaining: number | null;
  envs: string[];
  setChecklistItemsRemaining: (value: number | null) => void;
  editVariations?: (() => void) | null;
  visualChangesets: VisualChangesetInterface[];
  urlRedirects: URLRedirectInterface[];
  newPhase?: (() => void) | null;
  editPhases?: (() => void) | null;
  editPhase?: ((i: number | null) => void) | null;
  editTargeting?: (() => void) | null;
  editMetrics?: (() => void) | null;
  editResult?: (() => void) | null;
}

export default function TabbedPage({
  experiment,
  linkedFeatures,
  mutate,
  duplicate,
  editTags,
  editVariations,
  visualChangesets,
  envs,
  urlRedirects,
  editPhases,
  editTargeting,
  newPhase,
  editMetrics,
  editResult,
  checklistItemsRemaining,
  setChecklistItemsRemaining,
}: Props) {
  const [tab, setTab] = useLocalStorage<ExperimentTab>(
    `tabbedPageTab__${experiment.id}`,
    "overview"
  );

  const router = useRouter();

  const { apiCall } = useAuth();

  const [auditModal, setAuditModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [watchersModal, setWatchersModal] = useState(false);
  const [visualEditorModal, setVisualEditorModal] = useState(false);
  const [featureModal, setFeatureModal] = useState(false);
  const [urlRedirectModal, setUrlRedirectModal] = useState(false);
  const [healthNotificationCount, setHealthNotificationCount] = useState(0);

  // Results tab filters
  const [baselineRow, setBaselineRow] = useState<number>(0);
  const [differenceType, setDifferenceType] = useState<DifferenceType>(
    "relative"
  );
  const [variationFilter, setVariationFilter] = useState<number[]>([]);
  const [metricFilter, setMetricFilter] = useLocalStorage<ResultsMetricFilters>(
    `experiment-page__${experiment.id}__metric_filter`,
    {
      tagOrder: [],
      filterByTag: false,
    }
  );

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace(/^#/, "") as ExperimentTab;
      if (experimentTabs.includes(hash)) {
        setTab(hash);
      }
    };
    handler();
    window.addEventListener("hashchange", handler, false);
    return () => window.removeEventListener("hashchange", handler, false);
  }, [setTab]);

  const { phase, setPhase } = useSnapshot();

  const variables = {
    experiment: experiment.name,
    tags: experiment.tags,
    experimentStatus: experiment.status,
  };

  const viewingOldPhase =
    experiment.phases.length > 0 && phase < experiment.phases.length - 1;

  const setTabAndScroll = (tab: ExperimentTab) => {
    setTab(tab);
    const newUrl = window.location.href.replace(/#.*/, "") + "#" + tab;
    if (newUrl === window.location.href) return;
    window.history.pushState("", "", newUrl);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleIncrementHealthNotifications = useCallback(() => {
    setHealthNotificationCount((prev) => prev + 1);
  }, []);

  const handleSnapshotChange = useCallback(() => {
    // Reset notifications when snapshot changes and the health tab needs to re-render
    setHealthNotificationCount(0);
  }, []);

  const hasLiveLinkedChanges = includeExperimentInPayload(
    experiment,
    linkedFeatures.map((f) => f.feature)
  );

  const { data: sdkConnectionsData } = useSDKConnections();
  const connections = sdkConnectionsData?.connections || [];

  const projectConnections = connections.filter(
    (connection) =>
      !connection.projects.length ||
      connection.projects.includes(experiment.project || "")
  );
  const matchingConnections = projectConnections.filter(
    (connection) =>
      !visualChangesets.length || connection.includeVisualExperiments
  );

  const { data, mutate: mutateWatchers } = useApi<{
    userIds: string[];
  }>(`/experiment/${experiment.id}/watchers`);
  const { users, organization } = useUser();

  // Get name or email of all active users watching this experiment
  const usersWatching = (data?.userIds || [])
    .map((id) => users.get(id))
    .filter(isDefined)
    .map((u) => u.name || u.email);

  const { browser, deviceType } = useMemo(() => {
    const ua = navigator.userAgent;
    return getBrowserDevice(ua);
  }, []);

  const safeToEdit = experiment.status !== "running" || !hasLiveLinkedChanges;

  const isBandit = experiment.type === "multi-armed-bandit";
  const trackSource = "tabbed-page";
  return (
    <>
      {auditModal && (
        <Modal
          trackingEventModalType=""
          open={true}
          header="Audit Log"
          close={() => setAuditModal(false)}
          size="lg"
          closeCta="Close"
        >
          <HistoryTable type="experiment" id={experiment.id} />
        </Modal>
      )}
      {watchersModal && (
        <Modal
          trackingEventModalType=""
          open={true}
          header="Experiment Watchers"
          close={() => setWatchersModal(false)}
          closeCta="Close"
        >
          <ul>
            {usersWatching.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Modal>
      )}
      {visualEditorModal && (
        <VisualChangesetModal
          mode="add"
          experiment={experiment}
          mutate={mutate}
          close={() => setVisualEditorModal(false)}
          onCreate={async (vc) => {
            // Try to immediately open the visual editor
            await openVisualEditor({
              vc,
              apiCall,
              browser,
              deviceType,
            });
          }}
          cta="Open Visual Editor"
          source={trackSource}
        />
      )}
      {urlRedirectModal && (
        <UrlRedirectModal
          mode="add"
          experiment={experiment}
          mutate={mutate}
          close={() => setUrlRedirectModal(false)}
          source={trackSource}
        />
      )}
      {statusModal && (
        <EditStatusModal
          experiment={experiment}
          close={() => setStatusModal(false)}
          mutate={mutate}
          source={trackSource}
        />
      )}
      {featureModal && (
        <FeatureFromExperimentModal
          experiment={experiment}
          close={() => setFeatureModal(false)}
          mutate={mutate}
          source={trackSource}
        />
      )}
      {/* TODO: Update Experiment Header props to include redirect and pipe through to StartExperimentBanner */}

      <ExperimentHeader
        experiment={experiment}
        envs={envs}
        tab={tab}
        setTab={setTabAndScroll}
        mutate={mutate}
        safeToEdit={safeToEdit}
        setAuditModal={setAuditModal}
        setStatusModal={setStatusModal}
        setWatchersModal={setWatchersModal}
        duplicate={duplicate}
        usersWatching={usersWatching}
        mutateWatchers={mutateWatchers}
        editResult={editResult || undefined}
        editTargeting={editTargeting}
        editTags={editTags}
        newPhase={newPhase}
        editPhases={editPhases}
        healthNotificationCount={healthNotificationCount}
        checklistItemsRemaining={checklistItemsRemaining}
        linkedFeatures={linkedFeatures}
      />

      <div className="container-fluid pagecontents">
        {experiment.project ===
          getDemoDatasourceProjectIdForOrganization(organization.id) && (
          <div className="alert alert-info d-flex align-items-center mb-0 mt-2">
            <div className="flex-1">
              This experiment is part of our sample dataset. You can safely
              delete this once you are done exploring.
            </div>
            <div style={{ width: 180 }} className="ml-2">
              <DeleteDemoDatasourceButton
                onDelete={() => router.push("/experiments")}
                source="experiment"
              />
            </div>
          </div>
        )}
        <CustomMarkdown page={"experiment"} variables={variables} />

        {experiment.status === "stopped" && (
          <div className="pt-3">
            <StoppedExperimentBanner
              experiment={experiment}
              linkedFeatures={linkedFeatures}
              mutate={mutate}
              editResult={editResult || undefined}
            />
          </div>
        )}
        {viewingOldPhase &&
          ((!isBandit && tab === "results") ||
            (isBandit && tab === "explore")) && (
            <div className="alert alert-warning mt-3">
              <div>
                You are viewing the results of a previous experiment phase.{" "}
                <a
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setPhase(experiment.phases.length - 1);
                  }}
                >
                  Switch to the latest phase
                </a>
              </div>
              <div className="mt-1">
                <strong>Phase settings:</strong>{" "}
                {phaseSummary(experiment?.phases?.[phase])}
              </div>
            </div>
          )}
        <div
          className={clsx(
            "pt-3",
            tab === "overview" ? "d-block" : "d-none d-print-block"
          )}
        >
          <SetupTabOverview
            experiment={experiment}
            mutate={mutate}
            disableEditing={viewingOldPhase}
            linkedFeatures={linkedFeatures}
            visualChangesets={visualChangesets}
            editTargeting={editTargeting}
            matchingConnections={matchingConnections}
            checklistItemsRemaining={checklistItemsRemaining}
            setChecklistItemsRemaining={setChecklistItemsRemaining}
            envs={envs}
          />
          <Implementation
            experiment={experiment}
            mutate={mutate}
            editVariations={editVariations}
            setFeatureModal={setFeatureModal}
            setVisualEditorModal={setVisualEditorModal}
            setUrlRedirectModal={setUrlRedirectModal}
            visualChangesets={visualChangesets}
            urlRedirects={urlRedirects}
            editTargeting={editTargeting}
            linkedFeatures={linkedFeatures}
            envs={envs}
          />
          {experiment.status !== "draft" && (
            <div className="mt-3 mb-2 text-center d-print-none">
              <Button
                onClick={() => setTabAndScroll("results")}
                size="md"
                icon={<FaChartBar />}
              >
                View Results
              </Button>
            </div>
          )}
        </div>
        {isBandit ? (
          <div
            className={
              // todo: standardize explore & results tabs across experiment types
              isBandit && tab === "results"
                ? "container-fluid pagecontents d-block pt-0"
                : "d-none d-print-block"
            }
          >
            <BanditSummaryResultsTab
              experiment={experiment}
              mutate={mutate}
              isTabActive={tab === "results"}
            />
          </div>
        ) : null}
      </div>
      <div
        className={
          // todo: standardize explore & results tabs across experiment types
          (!isBandit && tab === "results") || (isBandit && tab === "explore")
            ? "container-fluid pagecontents d-block pt-0"
            : "d-none d-print-block"
        }
      >
        {/* TODO: Update ResultsTab props to include redirect and pipe through to StartExperimentBanner */}
        <ResultsTab
          experiment={experiment}
          mutate={mutate}
          editMetrics={editMetrics}
          editPhases={editPhases}
          editResult={editResult}
          newPhase={newPhase}
          connections={connections}
          envs={envs}
          setTab={setTabAndScroll}
          visualChangesets={visualChangesets}
          editTargeting={editTargeting}
          isTabActive={tab === "results"}
          safeToEdit={safeToEdit}
          baselineRow={baselineRow}
          setBaselineRow={setBaselineRow}
          differenceType={differenceType}
          setDifferenceType={setDifferenceType}
          variationFilter={variationFilter}
          setVariationFilter={setVariationFilter}
          metricFilter={metricFilter}
          setMetricFilter={setMetricFilter}
        />
      </div>
      <div
        className={
          tab === "health"
            ? "container-fluid pagecontents d-block pt-0"
            : "d-none d-print-block"
        }
      >
        <HealthTab
          experiment={experiment}
          onHealthNotify={handleIncrementHealthNotifications}
          onSnapshotUpdate={handleSnapshotChange}
          resetResultsSettings={() => {
            setBaselineRow(0);
            setDifferenceType("relative");
            setVariationFilter([]);
          }}
        />
      </div>

      <div className="mt-4 px-4 border-top pb-3">
        <div className="pt-2 pt-4 pb-5 container pagecontents">
          <div className="h3 mb-4">Comments</div>
          <DiscussionThread
            type="experiment"
            id={experiment.id}
            allowNewComments={!experiment.archived}
            projects={experiment.project ? [experiment.project] : []}
          />
        </div>
      </div>
    </>
  );
}
