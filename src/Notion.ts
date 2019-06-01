import { Observable, throwError } from "rxjs";
import { map } from "rxjs/operators";
import ApiClient from "./api/index";
import IOptions from "./options.d";
import INotion from "./notion.d";
import ISubscription from "./subscription.d";
import { getMetricLabels, validateMetric } from "./utils/metric";
import { pick } from "./utils/pick";
import { ISkillInstance } from "./skills/skill.d";

/**
 *
 */
export class Notion implements INotion {
  /**
   * @hidden
   */
  protected options: IOptions;
  /**
   * @hidden
   */
  protected api: ApiClient;

  constructor(options: IOptions) {
    this.options = Object.freeze(options);
    this.api = new ApiClient(this.options);

    if (!this.options.deviceId) {
      throw new Error("Notion: deviceId is mandatory");
    }
  }

  public async getInfo() {
    return await this.api.getInfo();
  }

  public async disconnect() {
    return await this.api.disconnect();
  }

  /**
   * @hidden
   */
  protected getMetric = (
    subscription: ISubscription
  ): Observable<any> => {
    const { metric, labels, group } = subscription;

    const error = validateMetric(metric, labels, this.options);
    if (error) {
      return throwError(error);
    }

    return new Observable(observer => {
      const withDefaultLabels = labels.length
        ? labels
        : getMetricLabels(metric);

      const subscriptionId = this.api.metrics.subscribe({
        metric: metric,
        labels: withDefaultLabels,
        group: group
      });

      const listener = this.api.metrics.on(
        metric,
        subscriptionId,
        (...data) => {
          observer.next(...data);
        }
      );

      return () => {
        this.api.metrics.unsubscribe(subscriptionId, listener);
      };
    });
  };

  /**
   * @param labels Name of metric properties to filter by
   * @returns Observable of acceleration metric events
   */
  public acceleration(...labels): Observable<any> {
    return this.getMetric({
      metric: "acceleration",
      labels: labels,
      group: true
    });
  }

  /**
   * @param labels Name of metric properties to filter by
   * @returns Observable of awareness metric events
   */
  public awareness(...labels): Observable<any> {
    return this.getMetric({
      metric: "awareness",
      labels: labels,
      group: false
    });
  }

  /**
   * @param labels Name of metric properties to filter by
   * @returns Observable of brainwaves metric events
   */
  public brainwaves(...labels): Observable<any> {
    return this.getMetric({
      metric: "brainwaves",
      labels: labels,
      group: true
    });
  }

  /**
   * @param labels Name of metric properties to filter by
   * @returns Observable of channelAnalysis metric events
   */
  public channelAnalysis(...labels): Observable<any> {
    return this.getMetric({
      metric: "channelAnalysis",
      labels: labels,
      group: true
    });
  }

  /**
   * @param labels Name of metric properties to filter by
   * @returns Observable of signalQuality metric events
   */
  public signalQuality(...labels): Observable<any> {
    return this.getMetric({
      metric: "signalQuality",
      labels: labels,
      group: true
    });
  }

  /**
   * @param labels Name of metric properties to filter by
   * @returns Observable of emotion metric events
   */
  public emotion(...labels): Observable<any> {
    return this.getMetric({
      metric: "emotion",
      labels: labels,
      group: false
    });
  }

  /**
   * @param labels Name of metric properties to filter by
   * @returns Observable of facialExpression metric events
   */
  public facialExpression(...labels): Observable<any> {
    return this.getMetric({
      metric: "facialExpression",
      labels: labels,
      group: false
    });
  }

  /**
   * @param labels Name of metric properties to filter by
   * @returns Observable of kinesis metric events
   */
  public kinesis(...labels): Observable<any> {
    return this.getMetric({
      metric: "kinesis",
      labels: labels,
      group: false
    });
  }

  /**
   * @param labels Name of metric properties to filter by
   * @returns Observable of predictions metric events
   */
  public predictions(...labels): Observable<any> {
    return this.getMetric({
      metric: "predictions",
      labels: labels,
      group: false
    });
  }

  /**
   * Observes last state of status and all subsequent status changes
   *
   * @param labels Name of metric properties to filter by
   * @returns Observable of status metric events
   */
  public status(...labels): Observable<any> {
    const error = validateMetric("status", labels, this.options);
    if (error) {
      return throwError(error);
    }

    const withDefaultLabels = labels.length
      ? labels
      : getMetricLabels("status");

    const status = new Observable(observer => {
      this.api.onStatus((...data) => {
        observer.next(...data);
      });

      return () => {};
    });

    return status.pipe(map(status => pick(status, withDefaultLabels)));
  }

  /**
   * @returns Training methods
   */
  public get training() {
    return {
      record: training => {
        const message = {
          fit: false,
          baseline: false,
          timestamp: this.api.timestamp,
          ...training
        };
        this.api.actions.dispatch({
          command: "training",
          action: "record",
          message
        });
      }
    };
  }

  /**
   * Accesses a skill by Bundle ID. Additionally, allows to observe
   * and push skill metrics
   *
   * @param bundleId Bundle ID of skill
   * @returns Skill isntance
   */
  public async skill(bundleId: string): Promise<ISkillInstance> {
    const skillData = await this.api.skills.get(bundleId);

    if (skillData === null) {
      return Promise.reject(
        new Error(
          `Access denied for: ${bundleId}. Make sure the skill is installed.`
        )
      );
    }

    return {
      metric: (label: string) => {
        const metricName = `skill~${skillData.id}~${label}`;
        const subscription = new Observable(observer => {
          const subscriptionId = this.api.metrics.subscribe({
            metric: metricName,
            labels: [label],
            group: true
          });

          const listener = this.api.metrics.on(
            metricName,
            subscriptionId,
            (...data) => {
              observer.next(...data);
            }
          );

          return () => {
            this.api.metrics.unsubscribe(subscriptionId, listener);
          };
        }).pipe(map(metric => metric[label]));

        Object.defineProperty(subscription, "next", {
          value: (metricValue: { [label: string]: any }): void => {
            this.api.metrics.next(metricName, {
              [label]: metricValue
            });
          }
        });

        return subscription;
      }
    };
  }
}

export default Notion;
